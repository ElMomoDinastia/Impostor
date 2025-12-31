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

let gameController = null;
let healthServer = null;

async function main() {
    logger_1.logger.info({ config: (0, config_1.getPublicConfig)() }, 'Starting HaxBall Impostor Game...');

    // 1. CONEXIÓN A MONGODB
    const mongoURI = process.env.MONGO_URI;
    if (mongoURI) {
        try {
            await mongoose_1.default.connect(mongoURI);
            logger_1.logger.info('✅ Conectado a MongoDB Atlas con éxito');
        } catch (error) {
            logger_1.logger.error('❌ Error al conectar a MongoDB. Continuando sin DB...');
        }
    }

    // 2. INICIALIZAR ADAPTADOR Y CONTROLADOR
    const roomConfig = {
        roomName: config_1.config.roomName,
        maxPlayers: config_1.config.maxPlayers,
        noPlayer: config_1.config.noPlayer,
        token: config_1.config.haxballToken,
        public: true,
        geo: config_1.config.geo
    };

    const adapter = (0, haxball_adapter_1.createHBRoomAdapter)(roomConfig);
    gameController = new controller_1.GameController(adapter);

    // 3. ARRANCAR EL JUEGO (Esperar a que la sala exista)
    try {
        await gameController.start();
        logger_1.logger.info('🎮 HaxBall Room Initialized!');
    } catch (error) {
        // AQUÍ ES DONDE DABA EL FATAL ERROR VACÍO
        console.error('❌ ERROR AL INICIAR LA SALA (Probable Token expirado o Error de Red):');
        console.error(error);
        process.exit(1);
    }

    // 4. RECIÉN AHORA ARRANCAR EL HEALTH SERVER
    healthServer = new server_1.HealthServer(() => ({
        status: gameController?.isRoomInitialized() ? 'ok' : 'degraded',
        uptime: healthServer?.getUptime() ?? 0,
        timestamp: new Date().toISOString(),
        roomLink: gameController?.getRoomLink() ?? null,
        roomInitialized: gameController?.isRoomInitialized() ?? false,
        currentPhase: gameController?.getCurrentPhase() ?? 'UNKNOWN',
        playersConnected: gameController?.getPlayerCount() ?? 0,
        roundsPlayed: gameController?.getRoundsPlayed() ?? 0,
    }), () => ({
        playersConnected: gameController?.getPlayerCount() ?? 0,
        playersInQueue: gameController?.getQueueCount() ?? 0,
        roundsPlayed: gameController?.getRoundsPlayed() ?? 0,
        currentPhase: gameController?.getCurrentPhase() ?? 'UNKNOWN',
        uptime: Math.floor((healthServer?.getUptime() ?? 0) / 1000),
    }));

    healthServer.start();
    logger_1.logger.info('🚀 Health server and Game are fully sync!');
}

function shutdown(code = 0) {
    logger_1.logger.info('Shutting down...');
    if (gameController) gameController.stop();
    if (healthServer) healthServer.stop();
    if (mongoose_1.default.connection) mongoose_1.default.connection.close();
    process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// CAPTURA DE ERRORES MEJORADA
process.on('uncaughtException', (error) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', error);
    shutdown(1);
});

main().catch((error) => {
    console.error('FATAL ERROR DURING STARTUP:');
    console.error(error.message);
    console.error(error.stack);
    shutdown(1);
});
