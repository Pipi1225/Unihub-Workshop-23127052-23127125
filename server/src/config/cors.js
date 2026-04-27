module.exports = function createCorsOptions(clientOrigin) {
	return {
		origin: clientOrigin,
		credentials: true,
	};
};
