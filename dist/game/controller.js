"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;

const mongoose_1 = __importDefault(require("mongoose"));
const types_1 = require("../game/types");
const state_machine_1 = require("../game/state-machine");
const handler_1 = require("../commands/handler");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const footballers_json_1 = __importDefault(require("../data/footballers.json"));

// --- CONFIGURACIÓN DE BASE DE DATOS ---
const playerLogSchema = new mongoose_1.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    timestamp: { type: Date, default: Date.now }
});

const roundLogSchema = new mongoose_1.default.Schema({
    impostorName: String,
    footballer: String,
    impostorWon: Boolean,
    votedOutName: String,
    timestamp: { type: Date, default: Date.now }
});

const PlayerLog = mongoose_1.default.models.PlayerLog || mongoose_1.default.model('PlayerLog', playerLogSchema, 'playerlogs');
const RoundLog = mongoose_1.default.models.RoundLog || mongoose_1.default.model('RoundLog', roundLogSchema, 'roundlogs');

const SEAT_POSITIONS = [
    { x: 0, y: -130 },
    { x: 124, y: -40 },
    { x: 76, y: 105 },
    { x: -76, y: 105 },
    { x: -124, y: -40 },
];

class GameController {
    adapter;
    state;
    footballers;
    phaseTimer = null;
    assignDelayTimer = null;
    roundLogs = [];

    constructor(adapter, footballers) {
        this.adapter = adapter;
        this.state = (0, types_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        
        // Conexión silenciosa a MongoDB
        if (config_1.config.mongoUri) {
            mongoose_1.default.connect(config_1.config.mongoUri)
                .then(() => logger_1.gameLogger.info("✅ MongoDB Atlas conectado"))
                .catch(err => logger_1.gameLogger.error("❌ Error DB:", err));
        }

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.adapter.setEventHandlers({
            onPlayerJoin: this.handlePlayerJoin.bind(this),
            onPlayerLeave: this.handlePlayerLeave.bind(this),
            onPlayerChat: this.handlePlayerChat.bind(this),
            onRoomLink: (link) => logger_1.gameLogger.info({ link }, 'Room is ready')
        });
    }

    handlePlayerJoin(player) {
        // Guardar ingreso en DB sin esperar (Fire and Forget)
        if (mongoose_1.default.connection.readyState === 1) {
            PlayerLog.create({
                name: player.name,
                auth: player.auth,
                conn: player.conn,
                room: config_1.config.roomName
            }).catch(() => {});
        }

        // Lógica de nombres duplicados
        for (const existing of this.state.players.values()) {
            if (existing.name.toLowerCase() === player.name.toLowerCase()) {
                this.adapter.sendAnnouncement(`❌ El nombre "${player.name}" ya está en uso`, player.id, { color: 0xff0000 });
                this.adapter.kickPlayer(player.id, 'Nombre duplicado');
                return;
            }
        }

        const gamePlayer = { id: player.id, name: player.name, auth: player.auth, isAdmin: player.admin, joinedAt: Date.now() };
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer }));
    }

    handlePlayerLeave(player) {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id }));
    }

    handlePlayerChat(player, message) {
        const msg = message.trim().toLowerCase();
        
        // Clave admin rápida
        if (msg === "alfajor") {
            this.adapter.setPlayerAdmin(player.id, true);
            this.adapter.sendAnnouncement("👑 Acceso Maestro Confirmado", player.id, { color: 0xFFD700 });
            return false;
        }

        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;

        // 1. GESTIÓN DE FANTASMAS
        const activePhases = [types_1.GamePhase.CLUES, types_1.GamePhase.DISCUSSION, types_1.GamePhase.VOTING, types_1.GamePhase.REVEAL];
        if (activePhases.includes(this.state.phase) && this.state.currentRound) {
            if (!this.isPlayerInRound(player.id) && !isAdmin) {
                if (command?.type === handler_1.CommandType.JOIN) {
                    if (!this.state.queue.includes(player.id)) {
                        this.state.queue = [...this.state.queue, player.id];
                        this.adapter.sendAnnouncement(`✅ ${player.name} en cola`, null, { color: 0x00ff00 });
                    }
                    return false;
                }
                return false; // Silencio para los que no juegan
            }
        }

        // 2. CONTROL DE PISTAS Y SPOILERS
        if (this.state.phase === types_1.GamePhase.CLUES && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id !== currentGiverId && !isAdmin) return false;

            const clueWord = message.trim().split(/\s+/)[0];
            const secretFootballer = this.state.currentRound?.footballer;
            
            if (secretFootballer && this.containsSpoiler(clueWord, secretFootballer)) {
                this.adapter.sendAnnouncement('❌ ¡No puedes decir el nombre!', player.id, { color: 0xff6b6b });
                return false;
            }

            this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord }));
            return false;
        }

        // 3. COMANDOS Y CHAT GENERAL
        if (!command) {
            this.adapter.sendAnnouncement(`${player.name}: ${message}`, null, { color: 0xffffff });
            return false;
        }

        const validation = (0, handler_1.validateCommand)(command, player, this.state, this.state.currentRound?.footballer);
        if (validation.valid && validation.action) {
            if (validation.action.type === 'START_GAME') validation.action.footballers = this.footballers;
            this.applyTransition((0, state_machine_1.transition)(this.state, validation.action));
        }

        return false;
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);

        if (this.state.phase === types_1.GamePhase.ASSIGN) {
            this.setupGameField();
            this.assignDelayTimer = setTimeout(() => {
                this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
            }, 3000);
        }

        if (this.state.phase === types_1.GamePhase.REVEAL) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' })), 3000);
        }

        if (this.state.phase === types_1.GamePhase.RESULTS) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' })), 8000);
        }
    }

    executeSideEffects(effects) {
        effects.forEach(e => {
            switch (e.type) {
                case 'ANNOUNCE_PUBLIC':
                    this.adapter.sendAnnouncement(e.message, null, e.style);
                    break;
                case 'ANNOUNCE_PRIVATE':
                    setTimeout(() => {
                        this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xffff00, style: 'bold' });
                    }, 150);
                    break;
                case 'SET_PHASE_TIMER':
                    this.setPhaseTimer(e.durationSeconds);
                    break;
                case 'CLEAR_TIMER':
                    this.clearPhaseTimer();
                    break;
                case 'LOG_ROUND':
                    this.logRoundToDB(e.result);
                    break;
                case 'AUTO_START_GAME':
                    setTimeout(() => {
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers }));
                    }, 2000);
                    break;
            }
        });
    }

    async logRoundToDB(result) {
        this.roundLogs.push(result);
        if (mongoose_1.default.connection.readyState === 1) {
            RoundLog.create({
                impostorName: result.impostorName,
                footballer: result.footballer,
                impostorWon: result.impostorWon,
                votedOutName: result.votedOutName
            }).catch(() => {});
        }
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
        
        try {
            await this.adapter.stopGame();
            await new Promise(r => setTimeout(r, 100));
            
            const allPlayers = await this.adapter.getPlayerList();
            for (const p of allPlayers) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
            
            await new Promise(r => setTimeout(r, 100));
            for (const id of roundPlayerIds) {
                await this.adapter.setPlayerTeam(id, 1);
                await new Promise(r => setTimeout(r, 50));
            }

            await new Promise(r => setTimeout(r, 200));
            await this.adapter.startGame();
            await new Promise(r => setTimeout(r, 500));

            roundPlayerIds.forEach((id, i) => {
                if (SEAT_POSITIONS[i]) {
                    this.adapter.setPlayerDiscProperties(id, {
                        x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0
                    });
                }
            });
        } catch (e) { logger_1.gameLogger.error("Setup error:", e); }
    }

    containsSpoiler(clue, footballer) {
        const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const c = norm(clue);
        const f = norm(footballer);
        return f.split(/\s+/).some(part => part.length > 2 && c.includes(part));
    }

    setPhaseTimer(s) {
        this.clearPhaseTimer();
        this.phaseTimer = setTimeout(() => {
            const p = this.state.phase;
            let type = p === types_1.GamePhase.CLUES ? 'CLUE_TIMEOUT' : p === types_1.GamePhase.DISCUSSION ? 'END_DISCUSSION' : p === types_1.GamePhase.VOTING ? 'END_VOTING' : null;
            if (type) this.applyTransition((0, state_machine_1.transition)(this.state, { type }));
        }, s * 1000);
    }

    clearPhaseTimer() {
        if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
        if (this.assignDelayTimer) { clearTimeout(this.assignDelayTimer); this.assignDelayTimer = null; }
    }

    isPlayerInRound(id) { return this.state.currentRound?.clueOrder.includes(id) ?? false; }
    isRoomInitialized() { return this.adapter.isInitialized(); }
    getCurrentPhase() { return this.state.phase; }
    getPlayerCount() { return this.state.players.size; }
    getRoomLink() { return this.adapter.getRoomLink(); }
    async start() { await this.adapter.initialize(); }
    stop() { this.clearPhaseTimer(); this.adapter.close(); }
}

exports.GameController = GameController;
