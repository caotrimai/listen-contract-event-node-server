const path = require('path')
const winston = require('winston')
require('winston-daily-rotate-file')
const {createLogger, format, transports} = winston

const LOG_FOLDER_PATH = path.join('./', 'logs')

const customFormat = format.printf(({level, message, timestamp}) => {
  return `${timestamp} [${level}]: ${message}`
})

// daily rotate log file
const dailyRotateTransports = new winston.transports.DailyRotateFile({
  level: 'info',
  format:  customFormat,
  filename: path.join(LOG_FOLDER_PATH, `%DATE%.log`),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
});

// daily rotate error log file
const dailyErrorRotateTransports = new winston.transports.DailyRotateFile({
  level: 'error',
  filename: path.join(LOG_FOLDER_PATH, `ERROR_%DATE%.log`),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    format.errors({stack: true}),
    winston.format.prettyPrint(),
    customFormat,
  ),
  defaultMeta: {service: 'listening-service'},
  transports: [
    // new winston.transports.Console(),
    dailyRotateTransports,
    dailyErrorRotateTransports,
  ],
})

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
  }))
}

module.exports = logger