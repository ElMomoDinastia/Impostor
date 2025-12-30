"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const haxball_adapter_1 = require("./adapter/haxball.adapter");
const controller_1 = require("./game/controller");
const server_1 = require("./health/server");

let gameController = null;
let healthServer = null;

async function main() {
    // 1. Capturamos variables de entorno del Workflow
    const roomId = process.env.ROOM_ID || "1";
    const hbToken = process.env.HAXBALL_TOKEN || config_1.config.haxballToken;

    logger_1.logger.info({ config: (0, config_1.getPublicConfig)() }, `Starting HaxBall Impostor Room #${roomId}...`);

    if (!hbToken) {
        logger_1.logger.warn('⚠️ No HAXBALL_TOKEN provided. Check GitHub Secrets.');
    }

    // 2. Configuración de la sala con GEO fija (Argentina)
    const roomConfig = {
        roomName: `${config_1.config.roomName} #${roomId}`, // Ej: "Mesa Impostor PRO #1"
        maxPlayers: config_1.config.maxPlayers,
        noPlayer: config_1.config.noPlayer,
        token: hbToken,
        public: true,
        // Forzamos la bandera de Argentina y ubicación
        geo: {
            code: "ar",
            lat: -34.5,
            lon: -58.4000015258789
        }
    };

    const adapter = (0, haxball_adapter_1.createHBRoomAdapter)(roomConfig);
    gameController = new controller_1.GameController(adapter);

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

    try {
        await gameController.start();
        logger_1.logger.info(`🎮 HaxBall Impostor Room #${roomId} is running!`);
        
        const link = gameController.getRoomLink();
        if (link) {
            logger_1.logger.info(`🔗 Room link: ${link}`);
        }
    }
    catch (error) {
        console.error('Game controller error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger_1.logger.error({ error: errorMessage }, 'Failed to start game controller');
        shutdown(1);
    }
}

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

main().catch((error) => {
    logger_1.logger.error({ error }, 'Fatal error during startup');
    shutdown(1);
});
