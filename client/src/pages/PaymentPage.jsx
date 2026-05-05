import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { registrationService } from '../services';
import { formatPrice } from '../utils/helpers';

export default function PaymentPage() {
  const { registrationId } = useParams();
  const navigate = useNavigate();

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [paymentData, setPaymentData] = useState({
    transaction_ref: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchRegistration();
  }, [registrationId]);

  const fetchRegistration = async () => {
    try {
      setLoading(true);
      const data = await registrationService.getRegistration(registrationId);
      setRegistration(data);
      setPaymentData((prev) => ({
        ...prev,
        amount: data.amount || '',
      }));
      setError(null);
    } catch (err) {
      setError('Lỗi khi tải thông tin đơn đăng ký');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPaymentData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await registrationService.confirmPayment(registrationId, paymentData);
      setSuccess(true);
      setTimeout(() => {
        navigate('/workshops');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi khi xác nhận thanh toán');
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

  if (!registration) {
    return <div className="text-center text-red-600">Đơn đăng ký không tìm thấy</div>;
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">Thanh toán thành công!</h1>
          <p className="text-gray-600 mb-4">Cảm ơn bạn đã đăng ký. Chuyển hướng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Xác Nhận Thanh Toán</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Registration Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Thông tin đơn</h2>
          <div className="space-y-3 text-gray-600">
            <div>
              <p className="text-sm font-semibold text-gray-700">ID Đơn</p>
              <p className="font-mono text-sm">{registration.id}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Tên</p>
              <p>{registration.student_name || registration.full_name}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Email</p>
              <p>{registration.email}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Số điện thoại</p>
              <p>{registration.phone_number}</p>
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm">Số tiền cần thanh toán</p>
              <p className="text-3xl font-bold text-green-600">{formatPrice(registration.amount)}</p>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Thông tin thanh toán</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mã giao dịch/Số serial thanh toán *
              </label>
              <input
                type="text"
                name="transaction_ref"
                value={paymentData.transaction_ref}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="VD: TXN123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền *</label>
              <input
                type="number"
                name="amount"
                value={paymentData.amount}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ngày thanh toán *
              </label>
              <input
                type="date"
                name="payment_date"
                value={paymentData.payment_date}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              <p className="font-semibold mb-1">Hướng dẫn thanh toán:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Chuyển khoản đến tài khoản được cấp</li>
                <li>Nhập mã giao dịch từ ngân hàng</li>
                <li>Xác nhận ngày thanh toán</li>
                <li>Chờ xác nhận từ admin</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
            >
              {submitting ? 'Đang xác nhận...' : 'Xác nhận thanh toán'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
