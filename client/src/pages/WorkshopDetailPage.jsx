import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { workshopService } from "../services";
import { formatDate, formatPrice } from "../utils/helpers";

export default function WorkshopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [workshop, setWorkshop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkshop();
  }, [id]);

  const fetchWorkshop = async () => {
    try {
      setLoading(true);
      const data = await workshopService.getWorkshop(id);
      setWorkshop(data);
      setError(null);
    } catch (err) {
      setError("Lỗi khi tải workshop");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Bạn chắc chắn muốn xóa workshop này?")) return;

    try {
      await workshopService.deleteWorkshop(id);
      alert("Xóa thành công");
      navigate("/workshops");
    } catch (err) {
      alert("Lỗi khi xóa workshop");
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!workshop) {
    return (
      <div className="text-center text-red-600">Workshop không tìm thấy</div>
    );
  }

  const availableSlots = Number.isFinite(workshop.available_slots)
    ? workshop.available_slots
    : workshop.total_slots - (workshop.sold_count || 0);
  const canRegister = availableSlots > 0;
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const roomMapUrl = workshop.room_map_url
    ? workshop.room_map_url.startsWith("/")
      ? `${apiBaseUrl}${workshop.room_map_url}`
      : workshop.room_map_url
    : "";

  return (
    <div>
      <Link
        to="/workshops"
        className="text-blue-600 hover:text-blue-800 mb-6 inline-block"
      >
        ← Quay lại danh sách
      </Link>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {workshop.thumbnail && (
          <img
            src={workshop.thumbnail}
            alt={workshop.title}
            className="w-full h-96 object-cover"
          />
        )}

        <div className="p-8">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start mb-6">
            <div className="min-w-0">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">
                {workshop.title}
              </h1>
              {isAdmin && workshop.ai_status && (
                <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                  AI Status: {workshop.ai_status}
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link
                  to={`/admin/workshops/${id}/edit`}
                  className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 text-center"
                >
                  Sửa
                </Link>
                <button
                  onClick={handleDelete}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Xóa
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Giá</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatPrice(workshop.price)}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Chỗ còn</p>
              <p className="text-2xl font-bold text-green-600">
                {availableSlots} / {workshop.total_slots}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Thời gian</p>
              <p className="text-lg font-bold text-purple-600">
                {formatDate(workshop.start_time)}
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-3">Mô tả</h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {workshop.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-4 text-gray-600 mb-8">
            <div>
              <p className="font-semibold">Địa điểm</p>
              <p>{workshop.room_name}</p>
            </div>
            <div>
              <p className="font-semibold">Người hướng dẫn</p>
              <p>{workshop.speaker_name}</p>
            </div>
            <div>
              <p className="font-semibold">Bắt đầu</p>
              <p>{formatDate(workshop.start_time)}</p>
            </div>
            <div>
              <p className="font-semibold">Kết thúc</p>
              <p>{formatDate(workshop.end_time)}</p>
            </div>
          </div>

          {roomMapUrl && (
            <div className="mb-8">
              <h3 className="text-2xl font-semibold text-gray-800 mb-3">
                Sơ đồ phòng
              </h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <img
                  src={roomMapUrl}
                  alt={`Sơ đồ phòng ${workshop.room_name || ""}`.trim()}
                  className="w-full max-h-105 object-contain"
                />
                <a
                  href={roomMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm text-blue-600 hover:underline"
                >
                  Mở sơ đồ phòng ở tab mới
                </a>
              </div>
            </div>
          )}

          {workshop.ai_summary && (
            <div className="mb-8 bg-gray-50 p-4 rounded">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">
                Tóm tắt AI
              </h3>
              <p className="text-gray-700">{workshop.ai_summary}</p>
            </div>
          )}

          {!isAdmin && (
            <div className="mt-8">
              {canRegister ? (
                <Link
                  to={`/workshops/${id}/payment`}
                  className="block bg-blue-600 text-white text-center py-3 px-6 rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  Đăng ký tham gia
                </Link>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-center">
                  Hết chỗ đăng ký
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
