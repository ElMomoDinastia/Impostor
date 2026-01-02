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

function getEnvBoolean(key, defaultValue) {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
}

function loadConfig() {
    const roomIdRaw = process.env.ROOM_ID || '1';
    const roomIdFormated = roomIdRaw.padStart(2, '0');
    const haxballToken = process.env[`TOKEN_${roomIdRaw}`] || process.env.HAXBALL_TOKEN;

    return {
        haxballToken: haxballToken && haxballToken.trim() !== '' ? haxballToken : undefined,
        roomName: `🔴  「 𝙄𝙈𝙋𝙊𝙎𝙏𝙊𝙍 」  #${roomIdFormated}`,
        
        // --- CAMBIOS SOLICITADOS ---
        maxPlayers: getEnvNumber('MAX_PLAYERS', 15),
        noPlayer: false, // Forzamos False para que se vea el Host
        
        // --- CONEXIÓN MONGO ---
        mongoUri: process.env.MONGO_URI, // Le decimos que lea el Secret de GitHub
        
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
        haxballToken: exports.config.hasToken ? '[REDACTED]' : '[NOT SET]',
    };
}
