import { API_BASE_URL, PULL_ENDPOINT, PUSH_ENDPOINT } from "../constants/config";
import { runSql } from "./db";

function mapPullData(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  return [];
}

export async function pullRegistrations(workshopId) {
  const url = `${API_BASE_URL}${PULL_ENDPOINT}?workshop_id=${encodeURIComponent(workshopId)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`);
  }

  const payload = await response.json();
  return mapPullData(payload);
}

export async function applyRegistrations(workshopId, items) {
  await runSql("BEGIN TRANSACTION");
  try {
    await runSql(
      "DELETE FROM local_registrations WHERE workshop_id = ? AND sync_status != 'PENDING'",
      [workshopId]
    );

    for (const item of items) {
      const registrationId = String(item.registration_id || item.id || "");
      const qrHash = String(item.qr_code_hash || "");
      const itemWorkshopId = String(item.workshop_id || workshopId || "");
      const fullName = String(item.full_name || item.fullName || "").trim();
      if (!registrationId || !qrHash) {
        continue;
      }

      if (!itemWorkshopId) {
        continue;
      }

      const existing = await runSql(
        "SELECT sync_status FROM local_registrations WHERE registration_id = ?",
        [registrationId]
      );
      if (existing.rows.length > 0 && existing.rows.item(0).sync_status === "PENDING") {
        continue;
      }

      const checkinStatus = item.checkin_status ? 1 : 0;
      const checkinTime = item.checkin_time || null;

      await runSql(
        "INSERT OR REPLACE INTO local_registrations (registration_id, qr_code_hash, workshop_id, full_name, checkin_status, checkin_time, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'SYNCED')",
        [registrationId, qrHash, itemWorkshopId, fullName, checkinStatus, checkinTime]
      );
    }

    await runSql("COMMIT");
  } catch (error) {
    await runSql("ROLLBACK");
    throw error;
  }
}

export async function pushPendingToServer() {
  const pendingResult = await runSql(
    "SELECT registration_id, qr_code_hash, workshop_id, checkin_time FROM local_registrations WHERE sync_status = 'PENDING'"
  );

  const pendingItems = [];
  for (let i = 0; i < pendingResult.rows.length; i += 1) {
    pendingItems.push(pendingResult.rows.item(i));
  }

  if (!pendingItems.length) {
    return { sent: 0 };
  }

  const response = await fetch(`${API_BASE_URL}${PUSH_ENDPOINT}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pendingItems),
  });

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`);
  }

  await runSql("BEGIN TRANSACTION");
  try {
    for (const item of pendingItems) {
      await runSql("UPDATE local_registrations SET sync_status = 'SYNCED' WHERE registration_id = ?", [
        item.registration_id,
      ]);
    }
    await runSql("COMMIT");
  } catch (error) {
    await runSql("ROLLBACK");
    throw error;
  }

  return { sent: pendingItems.length };
}
