import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { workshopService } from "../services";
import { formatDateInput } from "../utils/helpers";

export default function AdminWorkshopManagementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    location: "",
    room_map_url: "",
    instructor: "",
    total_slots: "",
    start_time: "",
    end_time: "",
    thumbnail: "",
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [roomMapFile, setRoomMapFile] = useState(null);
  const fileInputRef = useRef(null);
  const roomMapInputRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      fetchWorkshop();
    }
  }, [id]);

  const fetchWorkshop = async () => {
    try {
      setLoading(true);
      const data = await workshopService.getWorkshop(id);
      setFormData({
        title: data.title || "",
        description: data.description || "",
        price: data.price || "",
        location: data.room_name || "",
        room_map_url: data.room_map_url || "",
        instructor: data.speaker_name || "",
        total_slots: data.total_slots || "",
        start_time: formatDateInput(data.start_time) || "",
        end_time: formatDateInput(data.end_time) || "",
        thumbnail: data.thumbnail || "",
      });
      setError(null);
    } catch (err) {
      setError("Lỗi khi tải workshop");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleRoomMapChange = (e) => {
    setRoomMapFile(e.target.files[0]);
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleOpenRoomMapPicker = () => {
    roomMapInputRef.current?.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const normalizedPayload = {
        title: formData.title,
        description: formData.description,
        room_name: formData.location,
        room_map_url: formData.room_map_url,
        speaker_name: formData.instructor,
        total_slots: Number(formData.total_slots),
        start_time: formData.start_time,
        end_time: formData.end_time,
        is_paid: Number(formData.price) > 0,
        price: Number(formData.price),
      };

      const dataToSend = selectedFile
        ? (() => {
            const multipart = new FormData();
            Object.entries(normalizedPayload).forEach(([key, value]) => {
              multipart.append(key, String(value ?? ""));
            });
            multipart.append("pdf", selectedFile);
            if (roomMapFile) {
              multipart.append("room_map", roomMapFile);
            }
            return multipart;
          })()
        : roomMapFile
          ? (() => {
              const multipart = new FormData();
              Object.entries(normalizedPayload).forEach(([key, value]) => {
                multipart.append(key, String(value ?? ""));
              });
              multipart.append("room_map", roomMapFile);
              return multipart;
            })()
          : normalizedPayload;

      if (isEditing) {
        await workshopService.updateWorkshop(id, dataToSend);
      } else {
        const response = await workshopService.createWorkshop(dataToSend);

        alert("Tạo workshop thành công");
        navigate(`/workshops/${response.id}`);
        return;
      }

      alert("Cập nhật thành công");
      navigate(`/workshops/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi lưu workshop");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">
        {isEditing ? "Sửa Workshop" : "Tạo Workshop Mới"}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tiêu đề *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Nhập tiêu đề workshop"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mô tả {!selectedFile && "*"}
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              required={!selectedFile}
              rows="5"
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder={
                selectedFile
                  ? "Không bắt buộc - AI sẽ tự sinh từ PDF"
                  : "Nhập mô tả workshop"
              }
            />
            {selectedFile && (
              <p className="text-xs text-green-600 mt-2">
                ✓ AI sẽ tự tóm tắt PDF thành mô tả sau khi tạo
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Giá (VND) *
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="0"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Địa điểm *
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Nhập địa điểm"
            />
          </div>

          {/* Instructor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Người hướng dẫn *
            </label>
            <input
              type="text"
              name="instructor"
              value={formData.instructor}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Nhập tên người hướng dẫn"
            />
          </div>

          {/* Room Map */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sơ đồ phòng
            </label>
            <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenRoomMapPicker}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                >
                  Choose Room Map Image
                </button>
                <span className="text-sm text-gray-700 break-all">
                  {roomMapFile ? roomMapFile.name : "Chưa chọn file nào"}
                </span>
              </div>

              <input
                ref={roomMapInputRef}
                type="file"
                accept="image/*"
                onChange={handleRoomMapChange}
                className="hidden"
              />

              <p className="text-xs text-gray-500 mt-2">
                Chỉ hỗ trợ ảnh .png, .jpg, .jpeg, .webp.
              </p>
            </div>
          </div>

          {/* Total Slots */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Số chỗ *
            </label>
            <input
              type="number"
              name="total_slots"
              value={formData.total_slots}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="0"
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Thời gian bắt đầu *
            </label>
            <input
              type="datetime-local"
              name="start_time"
              value={formData.start_time}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Thời gian kết thúc *
            </label>
            <input
              type="datetime-local"
              name="end_time"
              value={formData.end_time}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* PDF Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tải lên PDF (tùy chọn)
            </label>
            <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                >
                  Choose PDF File
                </button>
                <span className="text-sm text-gray-700 break-all">
                  {selectedFile ? selectedFile.name : "Chưa chọn file nào"}
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              <p className="text-xs text-gray-500 mt-2">
                Chỉ hỗ trợ file .pdf. Bạn có thể dùng file mẫu tại{" "}
                <a
                  href="/Workshop_Sample.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Workshop_Sample.pdf
                </a>
                .
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
          >
            {submitting ? "Đang lưu..." : isEditing ? "Cập nhật" : "Tạo mới"}
          </button>
        </div>
      </form>
    </div>
  );
}
