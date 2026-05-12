import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Layout({ children }) {
  const { user, isAuthenticated, isAdmin, isOrganizer, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (path) =>
    location.pathname === path ? "border-b-2 border-blue-600" : "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center space-x-4 min-w-0">
            <Link to="/" className="text-2xl font-bold text-blue-600">
              📚 Workshop
            </Link>
            {isAuthenticated && (
              <div className="flex flex-wrap items-center gap-4 min-w-0">
                <Link
                  to="/workshops"
                  className={`px-3 py-2 text-gray-700 hover:text-blue-600 ${isActive("/workshops")}`}
                >
                  Danh sách Workshop
                </Link>
                <Link
                  to="/my-workshops"
                  className={`px-3 py-2 text-gray-700 hover:text-blue-600 ${isActive("/my-workshops")}`}
                >
                  Workshop Của Tôi
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className={`px-3 py-2 text-gray-700 hover:text-blue-600 ${isActive("/admin")}`}
                  >
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 md:flex-row md:items-center md:gap-4 md:flex-nowrap">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-600 whitespace-nowrap min-w-0">
                  {user?.full_name}{" "}
                  {isOrganizer ? "(Organizer)" : isAdmin ? "(Admin)" : ""}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 shrink-0 w-full md:w-auto"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full md:w-auto text-center"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
