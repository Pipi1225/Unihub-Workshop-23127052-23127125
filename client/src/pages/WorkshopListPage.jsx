import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { workshopService } from "../services";
import { formatDate, formatPrice } from "../utils/helpers";

export default function WorkshopListPage() {
  const { isAdmin } = useAuth();
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkshops();
  }, []);

  const fetchWorkshops = async () => {
    try {
      setLoading(true);
      const data = await workshopService.getWorkshops();
      setWorkshops(data);
      setError(null);
    } catch (err) {
      setError("Lỗi khi tải danh sách workshop");
      console.error(err);
    } finally {
      setLoading(false);
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Danh sách Workshop</h1>
        {isAdmin && (
          <Link
            to="/admin/workshops/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Tạo Workshop
          </Link>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {workshops.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Không có workshop nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workshops.map((workshop) => {
            const availableSlots = Number.isFinite(workshop.available_slots)
              ? workshop.available_slots
              : workshop.total_slots - (workshop.sold_count || 0);
            return (
              <div
                key={workshop.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden"
              >
                {workshop.thumbnail && (
                  <img
                    src={workshop.thumbnail}
                    alt={workshop.title}
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="p-4">
                  <div className="mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {workshop.title}
                    </h3>
                  </div>

                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {workshop.description}
                  </p>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p>
                      <span className="font-semibold">Giá:</span>{" "}
                      {formatPrice(workshop.price)}
                    </p>
                    <p>
                      <span className="font-semibold">Thời gian:</span>{" "}
                      {formatDate(workshop.start_time)}
                    </p>
                    <p>
                      <span className="font-semibold">Địa điểm:</span>{" "}
                      {workshop.room_name}
                    </p>
                    <p>
                      <span className="font-semibold">Chỗ còn:</span>{" "}
                      {availableSlots} / {workshop.total_slots}
                    </p>
                  </div>

                  <Link
                    to={`/workshops/${workshop.id}`}
                    className="block w-full bg-blue-600 text-white text-center py-2 rounded hover:bg-blue-700 transition"
                  >
                    Xem chi tiết
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
