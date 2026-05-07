import { useState, useEffect } from 'react';
import { statsService, workshopService } from '../services';
import { formatPrice, formatDate } from '../utils/helpers';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData, workshopsData] = await Promise.all([
        statsService.getStatistics().catch(() => null),
        workshopService.getWorkshops(),
      ]);

      setStats(statsData);
      setWorkshops(workshopsData);
      setError(null);
    } catch (err) {
      setError('Lỗi khi tải dữ liệu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
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
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard Quản Trị</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">Tổng Workshop</p>
            <p className="text-3xl font-bold text-blue-600">{stats.total_workshops || 0}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">Tổng Đăng ký</p>
            <p className="text-3xl font-bold text-green-600">{stats.total_registrations || 0}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">Doanh Thu</p>
            <p className="text-3xl font-bold text-purple-600">
              {formatPrice(stats.total_revenue || 0)}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm mb-2">Đã Thanh Toán</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.paid_registrations || 0}</p>
          </div>
        </div>
      )}

      {/* Workshop List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Các Workshop</h2>

        {workshops.length === 0 ? (
          <p className="text-gray-500">Không có workshop</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-800">Tiêu đề</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">ID</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">Thời gian</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">Giá</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">Chỗ</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">Đã Đăng ký</th>
                  <th className="px-4 py-3 font-semibold text-gray-800">AI Status</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map((workshop) => (
                  <tr key={workshop.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <a href={`/workshops/${workshop.id}`} className="text-blue-600 hover:underline">
                        {workshop.title}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <code
                        onClick={() => copyToClipboard(workshop.id)}
                        className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors"
                        title="Click để copy"
                      >
                        {workshop.id}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(workshop.start_time)}
                    </td>
                    <td className="px-4 py-3">{formatPrice(workshop.price)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm">
                        {workshop.sold_count || 0} / {workshop.total_slots}
                      </span>
                    </td>
                    <td className="px-4 py-3">{workshop.sold_count || 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded text-white ${
                          workshop.ai_status === 'COMPLETED'
                            ? 'bg-green-600'
                            : workshop.ai_status === 'PROCESSING'
                            ? 'bg-blue-600'
                            : workshop.ai_status === 'PENDING'
                            ? 'bg-yellow-600'
                            : 'bg-red-600'
                        }`}
                      >
                        {workshop.ai_status || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
