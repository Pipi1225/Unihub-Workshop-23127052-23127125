function notFoundHandler(_req, res) {
  res.status(404).json({
    ok: false,
    message: "Resource not found",
  });
}

function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 400;
    message = "File too large. Max size is 5MB.";
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    ok: false,
    message,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
