const EmailProvider = require("./providers/EmailProvider");

class NotificationService {
  constructor(channel = process.env.NOTIFICATION_CHANNEL) {
    this.channel = String(channel || "EMAIL").toUpperCase();
  }

  getProvider() {
    switch (this.channel) {
      case "EMAIL":
        return new EmailProvider();
      default:
        throw new Error(`Unsupported notification channel: ${this.channel}`);
    }
  }

  async send(payload) {
    const provider = this.getProvider();
    return provider.send(payload);
  }
}

module.exports = {
  NotificationService,
};
