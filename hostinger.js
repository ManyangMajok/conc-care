// Select this entry file in Hostinger's Express deployment settings.
process.env.NODE_ENV = "production";
process.env.HOST ||= "0.0.0.0";
process.env.PORT ||= "3000";
await import("./server/index.js");
