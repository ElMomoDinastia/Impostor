"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.getPublicConfig = getPublicConfig;

const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();

function getEnvNumber(key, defaultValue) {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

function loadConfig() {
    const instanceId = getEnvNumber('ROOM_ID', 0); 
    const dynamicTokenKey = `TOKEN_${instanceId}`;
    const haxballToken = process.env[dynamicTokenKey] || process.env.HAXBALL_TOKEN;

    return {
        roomNumber: instanceId,
        token: haxballToken && haxballToken.trim() !== '' ? haxballToken.trim() : undefined,
        isHeader: process.env.IS_HEADER === 'true',
        isFooter: process.env.IS_FOOTER === 'true',
        maxPlayers: getEnvNumber('MAX_PLAYERS', 15),
        public: true,
        mongoUri: process.env.MONGO_URI,
        port: getEnvNumber('PORT', 3000),
        logLevel: process.env.LOG_LEVEL || 'info',
        clueTime: getEnvNumber('CLUE_TIME', 20),
        discussionTime: getEnvNumber('DISCUSSION_TIME', 30),
        votingTime: getEnvNumber('VOTING_TIME', 20),
        
        isProduction: process.env.NODE_ENV === 'production',
        hasToken: !!(haxballToken && haxballToken.trim() !== ''),
    };
}
exports.config = loadConfig();

function getPublicConfig() {
    return {
        ...exports.config,
        token: exports.config.hasToken ? '[REDACTED]' : '[NOT SET]',
    };
}
