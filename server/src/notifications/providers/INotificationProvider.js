class INotificationProvider {
  async send() {
    throw new Error("send() not implemented");
  }
}

module.exports = INotificationProvider;
