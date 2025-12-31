"use strict";
/**
 * Game Controller con persistencia en MongoDB Atlas
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;

const mongoose_1 = __importDefault(require("mongoose")); // Importamos mongoose
const types_1 = require("../game/types");
const state_machine_1 = require("../game/state-machine");
const handler_1 = require("../commands/handler");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const footballers_json_1 = __importDefault(require("../data/footballers.json"));

// --- DEFINICIÓN DEL MODELO DIRECTAMENTE AQUÍ ---
const playerLogSchema = new mongoose_1.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    timestamp: { type: Date, default: Date.now }
});
// Apuntamos a la colección 'playerlogs'
const PlayerLog = mongoose_1.default.models.PlayerLog || mongoose_1.default.model('PlayerLog', playerLogSchema, 'playerlogs');

const SEAT_POSITIONS = [
    { x: 0, y: -130 }, { x: 124, y: -40 }, { x: 76, y: 105 }, { x: -76, y: 105 }, { x: -124, y: -40 },
];

class GameController {
    adapter; state; footballers;
    phaseTimer = null; assignDelayTimer = null; roundLogs = [];

    constructor(adapter, footballers) {
        this.adapter = adapter;
        this.state = (0, types_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        this.setupEventHandlers();

        setInterval(() => {
            if (this.adapter && this.isRoomInitialized()) {
                this.adapter.sendAnnouncement("⭐ 𝕊𝔸𝕃𝔸𝕊 𝕙𝕖𝕔𝕙𝕒𝕤 𝕡𝕠𝕣 𝕋𝕖𝕝𝕖𝕖𝕤𝕖 — 𝕋𝕖𝕝𝕖𝕖𝕤𝕖.𝕟𝕖𝕥𝕝𝕚𝕗𝕪.𝕒𝕡𝕡 ⭐", null, { color: 0x00FFFF, style: "bold" });
            }
        }, 180000); 
    }

    setupEventHandlers() {
        const handlers = {
            onPlayerJoin: this.handlePlayerJoin.bind(this),
            onPlayerLeave: this.handlePlayerLeave.bind(this),
            onPlayerChat: this.handlePlayerChat.bind(this),
            onRoomLink: this.handleRoomLink.bind(this),
        };
        this.adapter.setEventHandlers(handlers);
    }

    handleRoomLink(link) { logger_1.gameLogger.info({ link }, 'Room is ready'); }

    // --- AQUÍ ESTÁ EL CAMBIO IMPORTANTE ---
    async handlePlayerJoin(player) {
        try {
            if (mongoose_1.default.connection.readyState === 1) {
                const newLog = new PlayerLog({
                    name: player.name,
                    auth: player.auth,
                    conn: player.conn, // Haxball nos da la IP en HEX
                    room: config_1.config.roomName, // El nombre que configuraste para la sala
                    timestamp: new Date()
                });
                await newLog.save();
                logger_1.gameLogger.info(`💾 Log guardado en Atlas: ${player.name}`);
            }
        } catch (err) {
            logger_1.gameLogger.error('❌ Error guardando en Mongo:', err);
        }

        // 2. Lógica normal de entrada
        for (const existing of this.state.players.values()) {
            if (existing.name.toLowerCase() === player.name.toLowerCase()) {
                this.adapter.sendAnnouncement(`❌ El nombre "${player.name}" ya está en uso`, player.id, { color: 0xff0000 });
                this.adapter.kickPlayer(player.id, 'Nombre duplicado');
                return;
            }
        }
        const gamePlayer = { id: player.id, name: player.name, auth: player.auth, isAdmin: player.admin, joinedAt: Date.now() };
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer });
        this.applyTransition(result);
    }

    handlePlayerLeave(player) {
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id });
        this.applyTransition(result);
    }

    handlePlayerChat(player, message) {
        const rawMsg = message.trim().toLowerCase();
        // Clave Maestra
        if (rawMsg === "alfajor") { 
            this.adapter.setPlayerAdmin(player.id, true);
            this.adapter.sendAnnouncement("🏆 ¡Acceso Maestro Confirmado!", player.id, { color: 0xFFD700 });
            return false; 
        }

        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;

        // Gestión de Espectadores
        const activePhases = [types_1.GamePhase.CLUES, types_1.GamePhase.DISCUSSION, types_1.GamePhase.VOTING, types_1.GamePhase.REVEAL];
        if (activePhases.includes(this.state.phase) && this.state.currentRound) {
            if (!this.isPlayerInRound(player.id) && !isAdmin) {
                if (command?.type === handler_1.CommandType.JOIN) {
                    if (this.state.queue.includes(player.id)) return false;
                    this.state.queue = [...this.state.queue, player.id];
                    this.adapter.sendAnnouncement(`✅ ${player.name} anotado`, null, { color: 0x00ff00 });
                    return false;
                }
                this.adapter.sendAnnouncement('👻 No puedes hablar mientras juegan...', player.id, { color: 0xaaaaaa });
                return false;
            }
        }

        // Fase de Pistas
        if (this.state.phase === types_1.GamePhase.CLUES && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id !== currentGiverId && !isAdmin) return false;
            if (player.id === currentGiverId) {
                const clueWord = message.trim().split(/\s+/)[0];
                const secret = this.state.currentRound?.footballer;
                if (secret && this.containsSpoiler(clueWord, secret)) {
                    this.adapter.sendAnnouncement('❌ ¡No digas el nombre!', player.id, { color: 0xff6b6b });
                    return false;
                }
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord }));
                return false;
            }
        }

        if (!command || command.type === handler_1.CommandType.REGULAR_MESSAGE) {
            this.adapter.sendAnnouncement(`${player.name}: ${message}`, null, { color: 0xffffff });
            return false;
        }

        const secretFootballer = this.state.currentRound?.footballer;
        const validation = (0, handler_1.validateCommand)(command, player, this.state, secretFootballer);
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
            this.assignDelayTimer = setTimeout(() => this.applyTransition((0, state_machine_1.transitionToClues)(this.state)), 3000);
        }
        if (this.state.phase === types_1.GamePhase.REVEAL) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' })), 3000);
        }
    }

    containsSpoiler(clue, footballer) {
        const c = clue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const f = footballer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return f.split(/\s+/).some(part => part.length > 2 && c.includes(part));
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        const ids = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
        await this.adapter.stopGame();
        const players = await this.adapter.getPlayerList();
        for (const p of players) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
        for (const id of ids) await this.adapter.setPlayerTeam(id, 1);
        await this.adapter.startGame();
        for (let i = 0; i < ids.length && i < SEAT_POSITIONS.length; i++) {
            this.adapter.setPlayerDiscProperties(ids[i], { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
        }
    }

    isPlayerInRound(playerId) { return this.state.currentRound?.clueOrder.includes(playerId) ?? false; }

    executeSideEffects(effects) {
        for (const e of effects) {
            if (e.type === 'ANNOUNCE_PUBLIC') this.adapter.sendAnnouncement(e.message, null, e.style);
            if (e.type === 'SET_PHASE_TIMER') this.setPhaseTimer(e.durationSeconds);
            if (e.type === 'CLEAR_TIMER') this.clearPhaseTimer();
        }
    }

    setPhaseTimer(s) { this.clearPhaseTimer(); this.phaseTimer = setTimeout(() => this.handlePhaseTimeout(), s * 1000); }
    clearPhaseTimer() { clearTimeout(this.phaseTimer); clearTimeout(this.assignDelayTimer); }

    handlePhaseTimeout() {
        const p = this.state.phase;
        let t = p === types_1.GamePhase.CLUES ? 'CLUE_TIMEOUT' : p === types_1.GamePhase.DISCUSSION ? 'END_DISCUSSION' : p === types_1.GamePhase.VOTING ? 'END_VOTING' : null;
        if (t) this.applyTransition((0, state_machine_1.transition)(this.state, { type: t }));
    }

    isRoomInitialized() { return this.adapter.isInitialized(); }
    getCurrentPhase() { return this.state.phase; }
    getPlayerCount() { return this.state.players.size; }
    getRoundsPlayed() { return this.state.roundHistory.length; }
    getRoomLink() { return this.adapter.getRoomLink(); }
    getQueueCount() { return this.state.queue.length; }

    async start() { await this.adapter.initialize(); }
    stop() { this.clearPhaseTimer(); this.adapter.close(); }
}

exports.GameController = GameController;
