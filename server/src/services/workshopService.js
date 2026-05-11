const fsp = require("fs/promises");
const prisma = require("../config/prisma");
const createSupabaseClient = require("../config/supabase");
const { enqueueWorkshopSummary } = require("../queues/workshopSummaryQueue");
const { buildPdfPublicUrl } = require("../middlewares/uploadPdf");
const { buildRoomMapPublicUrl } = require("../middlewares/uploadImage");
const {
  getCachedWorkshops,
  setCachedWorkshops,
  invalidateWorkshopsCache,
} = require("../utils/workshopCache");

const ROOM_MAP_BUCKET = process.env.SUPABASE_ROOM_MAP_BUCKET || "room-maps";
const WORKSHOP_PDF_BUCKET =
  process.env.SUPABASE_WORKSHOP_PDF_BUCKET || "workshop_pdf";

function canUseSupabaseStorage() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function uploadRoomMapToSupabase(roomMapFile) {
  const supabase = createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const objectPath = `room-maps/${roomMapFile.filename}`;
  const buffer = await fsp.readFile(roomMapFile.path);

  const { error } = await supabase.storage
    .from(ROOM_MAP_BUCKET)
    .upload(objectPath, buffer, {
      contentType: roomMapFile.mimetype || "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || "Supabase upload failed");
  }

  const { data } = supabase.storage
    .from(ROOM_MAP_BUCKET)
    .getPublicUrl(objectPath);
  return data?.publicUrl || null;
}

async function uploadWorkshopPdfToSupabase(pdfFile) {
  const supabase = createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const objectPath = `workshop-pdfs/${pdfFile.filename}`;
  const buffer = await fsp.readFile(pdfFile.path);

  const { error } = await supabase.storage
    .from(WORKSHOP_PDF_BUCKET)
    .upload(objectPath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || "Supabase upload failed");
  }

  const { data } = supabase.storage
    .from(WORKSHOP_PDF_BUCKET)
    .getPublicUrl(objectPath);
  return data?.publicUrl || null;
}

async function resolveRoomMapUrl(roomMapFile, fallbackUrl) {
  if (!roomMapFile) {
    return fallbackUrl || null;
  }

  if (!canUseSupabaseStorage()) {
    return buildRoomMapPublicUrl(roomMapFile.filename);
  }

  try {
    const publicUrl = await uploadRoomMapToSupabase(roomMapFile);
    if (publicUrl) {
      await fsp.unlink(roomMapFile.path).catch(() => {});
      return publicUrl;
    }
  } catch (error) {
    console.warn(
      "[workshopService] Failed to upload room map to Supabase:",
      error.message,
    );
  }

  return buildRoomMapPublicUrl(roomMapFile.filename);
}

async function resolveWorkshopPdfUrl(pdfFile) {
  if (!pdfFile) {
    return null;
  }

  if (!canUseSupabaseStorage()) {
    return buildPdfPublicUrl(pdfFile.filename);
  }

  try {
    const publicUrl = await uploadWorkshopPdfToSupabase(pdfFile);
    if (publicUrl) {
      return publicUrl;
    }
  } catch (error) {
    console.warn(
      "[workshopService] Failed to upload workshop PDF to Supabase:",
      error.message,
    );
  }

  return buildPdfPublicUrl(pdfFile.filename);
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }
  return false;
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function buildWorkshopResponse(workshop) {
  const descriptionFallback =
    !workshop.description &&
    ["PENDING", "PROCESSING", "FAILED"].includes(workshop.ai_status)
      ? "Dang cap nhat mo ta."
      : workshop.description || null;

  return {
    id: workshop.id,
    title: workshop.title,
    description: descriptionFallback,
    room_name: workshop.room_name,
    speaker_name: workshop.speaker_name,
    room_map_url: workshop.room_map_url,
    total_slots: workshop.total_slots,
    available_slots: workshop.available_slots,
    is_paid: Boolean(workshop.is_paid),
    price: workshop.price || 0,
    start_time: workshop.start_time?.toISOString(),
    end_time: workshop.end_time?.toISOString(),
    pdf_url: workshop.pdf_url,
    ai_status: workshop.ai_status,
    ai_summary_status: workshop.ai_status,
  };
}

function validateWorkshopPayload(
  payload,
  { partial = false, hasFile = false } = {},
) {
  const errors = [];
  const title = payload.title?.trim();
  const roomName = payload.room_name?.trim();
  const totalSlots = parseNumber(payload.total_slots);
  const startTime = parseDate(payload.start_time);
  const endTime = parseDate(payload.end_time);
  const description = payload.description?.trim() || null;

  if (!partial || payload.title !== undefined) {
    if (!title) {
      errors.push("Missing title");
    }
  }

  if (!partial || payload.room_name !== undefined) {
    if (!roomName) {
      errors.push("Missing room_name");
    }
  }

  if (!partial || payload.total_slots !== undefined) {
    if (!Number.isFinite(totalSlots) || totalSlots <= 0) {
      errors.push("Invalid total_slots");
    }
  }

  if (!partial || payload.start_time !== undefined) {
    if (!startTime) {
      errors.push("Invalid start_time");
    }
  }

  if (!partial || payload.end_time !== undefined) {
    if (!endTime) {
      errors.push("Invalid end_time");
    }
  }

  // Description is required only if no file will be uploaded
  if (!partial || payload.description !== undefined) {
    if (!hasFile && !description) {
      errors.push("Missing description (required if no PDF)");
    }
  }

  if (startTime && endTime && endTime <= startTime) {
    errors.push("end_time must be after start_time");
  }

  return {
    errors,
    data: {
      title,
      room_name: roomName,
      speaker_name: payload.speaker_name?.trim() || null,
      room_map_url: payload.room_map_url?.trim() || null,
      total_slots: totalSlots,
      is_paid: parseBoolean(payload.is_paid),
      price: parseNumber(payload.price) || 0,
      start_time: startTime,
      end_time: endTime,
      description,
    },
  };
}

async function listWorkshops({ includeAll = false } = {}) {
  if (!includeAll) {
    const cached = await getCachedWorkshops();
    if (cached) {
      return cached;
    }
  }

  const workshops = await prisma.workshops.findMany({
    where: includeAll ? {} : { end_time: { gte: new Date() } },
    orderBy: { start_time: "asc" },
  });

  const response = workshops.map(buildWorkshopResponse);

  if (!includeAll) {
    await setCachedWorkshops(response);
  }

  return response;
}

async function getWorkshopById(workshopId) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop id"), { statusCode: 400 });
  }

  const workshop = await prisma.workshops.findUnique({
    where: { id: workshopId },
  });

  if (!workshop) {
    throw Object.assign(new Error("Workshop not found"), { statusCode: 404 });
  }

  return buildWorkshopResponse(workshop);
}

async function createWorkshop({ payload, file, roomMapFile }) {
  const { errors, data } = validateWorkshopPayload(payload, {
    partial: false,
    hasFile: !!file,
  });
  if (errors.length) {
    throw Object.assign(new Error(errors.join("; ")), { statusCode: 400 });
  }

  if (data.is_paid && data.price <= 0) {
    throw Object.assign(new Error("Invalid price for paid workshop"), {
      statusCode: 400,
    });
  }

  const pdfUrl = await resolveWorkshopPdfUrl(file);
  const roomMapUrl = await resolveRoomMapUrl(
    roomMapFile,
    data.room_map_url || null,
  );
  const aiStatus = file
    ? "PROCESSING"
    : data.description
      ? "COMPLETED"
      : "PENDING";

  const workshop = await prisma.workshops.create({
    data: {
      title: data.title,
      description: file ? null : data.description,
      room_name: data.room_name,
      speaker_name: data.speaker_name,
      room_map_url: roomMapUrl,
      total_slots: data.total_slots,
      available_slots: data.total_slots,
      is_paid: data.is_paid,
      price: data.is_paid ? data.price : 0,
      start_time: data.start_time,
      end_time: data.end_time,
      pdf_url: pdfUrl,
      ai_status: aiStatus,
    },
  });

  await invalidateWorkshopsCache();

  if (file) {
    await enqueueWorkshopSummary({
      workshop_id: workshop.id,
      pdf_path: file.path,
    });
  }

  return buildWorkshopResponse(workshop);
}

async function updateWorkshop({ workshopId, payload, file, roomMapFile }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop id"), { statusCode: 400 });
  }

  const { errors, data } = validateWorkshopPayload(payload, {
    partial: true,
    hasFile: !!file,
  });
  if (errors.length) {
    throw Object.assign(new Error(errors.join("; ")), { statusCode: 400 });
  }

  const resolvedRoomMapUrl = await resolveRoomMapUrl(
    roomMapFile,
    data.room_map_url || null,
  );
  const resolvedPdfUrl = await resolveWorkshopPdfUrl(file);

  const workshop = await prisma.$transaction(async (tx) => {
    const existing = await tx.workshops.findUnique({
      where: { id: workshopId },
    });

    if (!existing) {
      throw Object.assign(new Error("Workshop not found"), { statusCode: 404 });
    }

    const updates = {};

    if (payload.title !== undefined) updates.title = data.title;
    if (payload.description !== undefined)
      updates.description = data.description;
    if (payload.room_name !== undefined) updates.room_name = data.room_name;
    if (payload.speaker_name !== undefined)
      updates.speaker_name = data.speaker_name;
    if (payload.room_map_url !== undefined)
      updates.room_map_url = data.room_map_url;
    if (roomMapFile) {
      updates.room_map_url = resolvedRoomMapUrl;
    }
    if (payload.is_paid !== undefined) updates.is_paid = data.is_paid;
    if (payload.price !== undefined)
      updates.price = data.is_paid ? data.price : 0;
    if (
      payload.is_paid !== undefined &&
      !data.is_paid &&
      payload.price === undefined
    ) {
      updates.price = 0;
    }
    if (payload.start_time !== undefined) updates.start_time = data.start_time;
    if (payload.end_time !== undefined) updates.end_time = data.end_time;

    if (payload.total_slots !== undefined) {
      const soldCount = await tx.registrations.count({
        where: {
          workshop_id: workshopId,
          payment_status: { in: ["PAID", "PENDING"] },
        },
      });

      if (data.total_slots < soldCount) {
        throw Object.assign(
          new Error("total_slots must be greater than sold tickets"),
          { statusCode: 400 },
        );
      }

      updates.total_slots = data.total_slots;
      updates.available_slots = Math.max(data.total_slots - soldCount, 0);
    }

    if (file) {
      updates.pdf_url = resolvedPdfUrl;
      updates.ai_status = "PROCESSING";
      updates.description = null;
    } else if (payload.description !== undefined) {
      updates.ai_status = "COMPLETED";
    }

    return tx.workshops.update({
      where: { id: workshopId },
      data: updates,
    });
  });

  await invalidateWorkshopsCache();

  if (file) {
    await enqueueWorkshopSummary({
      workshop_id: workshop.id,
      pdf_path: file.path,
    });
  }

  return buildWorkshopResponse(workshop);
}

async function deleteWorkshop({ workshopId }) {
  if (!workshopId) {
    throw Object.assign(new Error("Missing workshop id"), { statusCode: 400 });
  }

  const registrationsCount = await prisma.registrations.count({
    where: { workshop_id: workshopId },
  });

  if (registrationsCount > 0) {
    throw Object.assign(
      new Error(
        "Cannot delete workshop with registrations. Cancel tickets first.",
      ),
      { statusCode: 409 },
    );
  }

  await prisma.workshops.delete({ where: { id: workshopId } });
  await invalidateWorkshopsCache();

  return { ok: true };
}

module.exports = {
  listWorkshops,
  getWorkshopById,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
};
