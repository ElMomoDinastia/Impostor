"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;

const state_machine_1 = require("../game/state-machine");
const handler_1 = require("../commands/handler");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const footballers_json_1 = __importDefault(require("../data/footballers.json"));
const mongoose_1 = __importDefault(require("mongoose"));

// --- DEFINICIÓN DEL MODELO DE MONGO ---
const PlayerLog = mongoose_1.default.model('PlayerLog', new mongoose_1.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    timestamp: { type: Date, default: Date.now }
}));

const SEAT_POSITIONS = [
    { x: 0, y: -130 },    // Top (Seat 1)
    { x: 124, y: -40 },   // Top-right (Seat 2)
    { x: 76, y: 105 },    // Bottom-right (Seat 3)
    { x: -76, y: 105 },   // Bottom-left (Seat 4)
    { x: -124, y: -40 },  // Top-left (Seat 5)
];

class GameController {
    constructor(adapter, footballers) {
        this.phaseTimer = null;
        this.assignDelayTimer = null;
        this.roundLogs = [];
        this.announceTimer = null;
        this.adapter = adapter;
        this.state = (0, state_machine_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        this.setupEventHandlers();
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

    handleRoomLink(link) {
        logger_1.gameLogger.info({ link }, 'Room is ready');
    }

    async handlePlayerJoin(player) {
        for (const existing of this.state.players.values()) {
            if (existing.name.toLowerCase() === player.name.toLowerCase()) {
                this.adapter.sendAnnouncement(`❌ El nombre "${player.name}" ya está en uso`, player.id, { color: 0xff0000 });
                this.adapter.kickPlayer(player.id, 'Nombre duplicado');
                return;
            }
        }
        // --- GUARDAR EN MONGO ---
        try {
            await PlayerLog.create({
                name: player.name,
                auth: player.auth,
                conn: player.conn,
                room: config_1.config.roomName
            });
            logger_1.gameLogger.info({ player: player.name }, 'Player data saved to MongoDB');
        } catch (error) {
            logger_1.gameLogger.error({ error }, 'Failed to save player data to MongoDB');
        }

        const gamePlayer = {
            id: player.id,
            name: player.name,
            auth: player.auth,
            isAdmin: player.admin,
            joinedAt: Date.now()
        };
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer });
        this.applyTransition(result);
    }

    handlePlayerLeave(player) {
        const result = (0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id });
        this.applyTransition(result);
    }

    handlePlayerChat(player, message) {
        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;
        const activePhases = ["CLUES", "DISCUSSION", "VOTING", "REVEAL"];

        if (activePhases.includes(this.state.phase) && this.state.currentRound) {
            if (!this.isPlayerInRound(player.id) && !isAdmin) {
                if (command && command.type === "JOIN") {
                    if (this.state.queue.includes(player.id)) {
                        this.adapter.sendAnnouncement(`⏳ Ya estás en cola.`, player.id, { color: 0x00bfff });
                        return false;
                    }
                    this.state.queue = [...this.state.queue, player.id];
                    this.adapter.sendAnnouncement(`✅ ${player.name} se anotó`, null, { color: 0x00ff00 });
                    return false;
                }
                this.adapter.sendAnnouncement('👻 Los muertos no hablan...', player.id, { color: 0xaaaaaa });
                return false;
            }
        }

        if (this.state.phase === "CLUES" && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id !== currentGiverId && !isAdmin) {
                this.adapter.sendAnnouncement('⏳ Espera tu turno...', player.id, { color: 0xffaa00 });
                return false;
            }
            const clueWord = message.trim().split(/\s+/)[0];
            if (clueWord) {
                if (this.containsSpoiler(clueWord, this.state.currentRound.footballer)) {
                    this.adapter.sendAnnouncement('❌ ¡No puedes decir el nombre!', player.id, { color: 0xff6b6b });
                    return false;
                }
                const result = (0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord });
                this.applyTransition(result);
                return false;
            }
        }

        if (!command || command.type === "REGULAR_MESSAGE") {
            this.adapter.sendAnnouncement(`${player.name}: ${message}`, null, { color: 0xffffff });
            return false;
        }

        if (command.type === "HELP") {
            this.adapter.sendAnnouncement((0, handler_1.generateHelpText)(this.state.phase, isAdmin), player.id, { color: 0x00bfff });
            return false;
        }

        const validation = (0, handler_1.validateCommand)(command, player, this.state, this.state.currentRound?.footballer);
        if (!validation.valid) {
            this.adapter.sendAnnouncement(`❌ ${validation.error}`, player.id, { color: 0xff6b6b });
            return false;
        }
        if (validation.action) {
            const result = (0, state_machine_1.transition)(this.state, validation.action);
            this.applyTransition(result);
        }
        return false;
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);
        if (this.state.phase === "ASSIGN") {
            this.setupGameField();
            this.assignDelayTimer = setTimeout(() => {
                this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
            }, 3000);
        }
        if (this.state.phase === "RESULTS") {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' })), 8000);
        }
    }

    containsSpoiler(clue, footballer) {
        const clueLower = clue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const footballerLower = footballer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return footballerLower.split(/\s+/).some(part => part.length > 2 && clueLower.includes(part));
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        try {
            const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
            await this.adapter.setTeamsLock(true);
            await this.adapter.stopGame();
            const allPlayers = await this.adapter.getPlayerList();
            for (const p of allPlayers) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
            for (const id of roundPlayerIds) await this.adapter.setPlayerTeam(id, 1);
            await this.adapter.startGame();
            for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
                await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
            }
        } catch (error) {
            logger_1.gameLogger.error({ error }, 'Failed field setup');
        }
    }

    isPlayerInRound(playerId) {
        return this.state.currentRound?.clueOrder.includes(playerId) || false;
    }

    executeSideEffects(effects) {
        for (const effect of effects) {
            switch (effect.type) {
                case 'ANNOUNCE_PUBLIC': this.adapter.sendAnnouncement(effect.message, null, effect.style); break;
                case 'ANNOUNCE_PRIVATE': this.adapter.sendAnnouncement(effect.message, effect.playerId, { color: 0xffff00 }); break;
                case 'SET_PHASE_TIMER': this.setPhaseTimer(effect.durationSeconds); break;
                case 'CLEAR_TIMER': this.clearPhaseTimer(); break;
            }
        }
    }

    setPhaseTimer(duration) {
        this.clearPhaseTimer();
        this.phaseTimer = setTimeout(() => this.handlePhaseTimeout(), duration * 1000);
    }

    clearPhaseTimer() {
        if (this.phaseTimer) clearTimeout(this.phaseTimer);
        if (this.assignDelayTimer) clearTimeout(this.assignDelayTimer);
    }

    handlePhaseTimeout() {
        let type = "";
        if (this.state.phase === "CLUES") type = "CLUE_TIMEOUT";
        else if (this.state.phase === "DISCUSSION") type = "END_DISCUSSION";
        else if (this.state.phase === "VOTING") type = "END_VOTING";
        if (type) this.applyTransition((0, state_machine_1.transition)(this.state, { type }));
    }

    async start() {
        await this.adapter.initialize();
        this.announceTimer = setInterval(() => {
            this.adapter.sendAnnouncement("📢 Sala creada por: 【 𝙏𝙚𝙡𝙚𝙚𝙨𝙚 】", null, { color: 0x00FF00 });
        }, 5 * 60 * 1000);
    }

    stop() {
        this.clearPhaseTimer();
        this.adapter.close();
        if (this.announceTimer) clearInterval(this.announceTimer);
    }
}
exports.GameController = GameController;
