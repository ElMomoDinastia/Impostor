"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });

const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const haxball_adapter_1 = require("./adapter/haxball.adapter");
const controller_1 = require("./game/controller");
const server_1 = require("./health/server");
const mongoose_1 = __importDefault(require("mongoose"));
const tokenSchema = new mongoose_1.default.Schema({
    val: String,
    usado: { type: Boolean, default: false },
    fecha: { type: Date, default: Date.now },
    fechaUso: Date
});
const TokenModel = mongoose_1.default.model('Token', tokenSchema, 'tokens');
let gameController = null;
let healthServer = null;

async function main() {
    logger_1.logger.info({ config: (0, config_1.getPublicConfig)() }, 'Starting HaxBall Impostor Game...');
   
    const mongoURI = process.env.MONGO_URI || config_1.config.mongoUri;
    let tokenDB = null; 
    if (mongoURI) {
        try {
            await mongoose_1.default.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
            global.db = mongoose_1.default.connection;
            logger_1.logger.info('✅ Conectado a MongoDB Atlas con éxito');

            const doc = await TokenModel.findOneAndUpdate(
                { usado : false },
                { $set: { usado: true, fechaUso: new Date() } },
                { sort: { fecha: 1 }, new: true }
            );

            if (doc) {
                tokenDB = doc.val;
                logger_1.logger.info("Token agarrado de la base de datos :)");
            }     
        } catch (error) {
            logger_1.logger.error('❌ Error al conectar a MongoDB. El juego funcionará sin base de datos.');
        }
    }

   const roomConfig = {
        roomNumber: process.env.ROOM_NUMBER || config_1.config.roomNumber, 
        isHeader: process.env.IS_HEADER === 'true',     
        isFooter: process.env.IS_FOOTER === 'true',      
        roomName: config_1.config.roomName,
        maxPlayers: config_1.config.maxPlayers,
        noPlayer: config_1.config.noPlayer,        
        token: tokenDB || config_1.config.token, 
        public: true,
        geo: config_1.config.geo
    };

    const adapter = (0, haxball_adapter_1.createHBRoomAdapter)(roomConfig);
    gameController = new controller_1.GameController(adapter, null, mongoose_1.default.connection);

    // 3. HEALTH SERVER
    healthServer = new server_1.HealthServer(() => ({
        status: gameController?.isRoomInitialized() ? 'ok' : 'degraded',
        uptime: healthServer?.getUptime() ?? 0,
        timestamp: new Date().toISOString(),
        roomLink: gameController?.getRoomLink() ?? null,
        playersConnected: gameController?.getPlayerCount() ?? 0,
        currentPhase: gameController?.getCurrentPhase() ?? 'UNKNOWN',
    }), () => ({
        playersConnected: gameController?.getPlayerCount() ?? 0,
        playersInQueue: gameController?.getQueueCount() ?? 0,
        currentPhase: gameController?.getCurrentPhase() ?? 'UNKNOWN',
        uptime: Math.floor((healthServer?.getUptime() ?? 0) / 1000),
    }));
    
    healthServer.start();

    try {
        await gameController.start();
        logger_1.logger.info('🎮 HaxBall Impostor Game is running!');
    } catch (error) {
        logger_1.logger.error('Failed to start game controller');
        console.error(error); 
        shutdown(1);
    }
}

function shutdown(code = 0) {
    logger_1.logger.info('Shutting down...');
    if (gameController) gameController.stop();
    if (healthServer) healthServer.stop();
    process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
    logger_1.logger.error({ error }, 'Uncaught exception');
    shutdown(1);
});

main().catch((error) => {
    logger_1.logger.error({ error }, 'Fatal error during startup');
    shutdown(1);
});
