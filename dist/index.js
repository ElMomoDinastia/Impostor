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

    // 2. TOKEN CHECK
    if (!config_1.config.hasToken) {
        logger_1.logger.warn('⚠️ No HAXBALL_TOKEN provided. You will need to solve recaptcha manually.');
    }

    // 3. INICIALIZAR ADAPTADOR Y CONTROLADOR
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

    // 4. CONFIGURAR HEALTH SERVER (Panel de control/estadísticas)
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

    // 5. ARRANCAR EL JUEGO
    try {
        await gameController.start();
        logger_1.logger.info('🎮 HaxBall Impostor Game is running!');
        logger_1.logger.info(`📊 Health check available at http://localhost:${config_1.config.port}/health`);
        
        if (gameController.getRoomLink()) {
            logger_1.logger.info(`🔗 Room link: ${gameController.getRoomLink()}`);
        }
    } catch (error) {
        logger_1.logger.error({ error }, 'Failed to start game controller');
        shutdown(1);
    }
}

// FUNCION DE CIERRE SEGURO
function shutdown(code = 0) {
    logger_1.logger.info('Shutting down...');
    if (gameController) {
        gameController.stop();
        gameController = null;
    }
    if (healthServer) {
        healthServer.stop();
        healthServer = null;
    }
    process.exit(code);
}

// EVENTOS DE PROCESO
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
    logger_1.logger.error({ error }, 'Uncaught exception');
    shutdown(1);
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error({ reason }, 'Unhandled rejection');
    shutdown(1);
});

// EJECUCIÓN
main().catch((error) => {
    logger_1.logger.error({ error }, 'Fatal error during startup');
    shutdown(1);
});
