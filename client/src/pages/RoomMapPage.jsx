import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { workshopService } from "../services";

export default function RoomMapPage() {
  const { id } = useParams();
  const [workshop, setWorkshop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWorkshop = async () => {
      try {
        setLoading(true);
        const data = await workshopService.getWorkshop(id);
        setWorkshop(data);
        setError(null);
      } catch (err) {
        setError("Lỗi khi tải sơ đồ phòng");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkshop();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !workshop) {
    return (
      <div className="text-center text-red-600">Không thể tải sơ đồ phòng</div>
    );
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const roomMapUrl = workshop.room_map_url
    ? workshop.room_map_url.startsWith("/")
      ? `${apiBaseUrl}${workshop.room_map_url}`
      : workshop.room_map_url
    : "";

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/my-workshops"
        className="text-blue-600 hover:text-blue-800 mb-6 inline-block"
      >
        ← Quay lại Workshop của tôi
      </Link>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Sơ đồ phòng: {workshop.title}
        </h1>

        {roomMapUrl ? (
          <img
            src={roomMapUrl}
            alt={`Sơ đồ phòng ${workshop.room_name || ""}`.trim()}
            className="w-full max-h-[70vh] object-contain"
          />
        ) : (
          <div className="text-gray-500">Chưa cập nhật sơ đồ phòng.</div>
        )}
      </div>
    </div>
  );
}
