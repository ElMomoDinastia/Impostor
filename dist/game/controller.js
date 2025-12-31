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

const PlayerLog = mongoose_1.default.model('PlayerLog', new mongoose_1.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    timestamp: { type: Date, default: Date.now }
}));

const SEAT_POSITIONS = [
    { x: 0, y: -130 }, { x: 124, y: -40 }, { x: 76, y: 105 }, { x: -76, y: 105 }, { x: -124, y: -40 },
];

class GameController {
    constructor(adapter, footballers) {
        this.phaseTimer = null;
        this.assignDelayTimer = null;
        this.roundLogs = [];
        this.announceTimer = null;
        this.adapter = adapter;
        
        // 1. INICIALIZACIÓN LIMPIA
        this.state = (0, state_machine_1.createInitialState)({
            minPlayers: 5,
            clueTimeSeconds: config_1.config.clueTime || 30,
            discussionTimeSeconds: config_1.config.discussionTime || 30,
            votingTimeSeconds: config_1.config.votingTime || 45,
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

    handleRoomLink(link) { logger_1.gameLogger.info({ link }, 'Room is ready'); }

    async handlePlayerJoin(player) {
        // SEGURIDAD: Limpiar cualquier rastro previo del mismo ID
        this.state.players.delete(player.id);
        
        for (const existing of this.state.players.values()) {
            if (existing.name.toLowerCase() === player.name.toLowerCase()) {
                this.adapter.kickPlayer(player.id, 'Nombre duplicado');
                return;
            }
        }

        try {
            await PlayerLog.create({ name: player.name, auth: player.auth, conn: player.conn, room: config_1.config.roomName });
        } catch (e) {}

        const gamePlayer = { id: player.id, name: player.name, auth: player.auth, isAdmin: player.admin, joinedAt: Date.now() };
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer }));
    }

    handlePlayerLeave(player) {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id }));
    }

    handlePlayerChat(player, message) {
        const msg = message.trim().toLowerCase();
        
        // COMANDO DE EMERGENCIA PARA ADMINS
        if (msg === "!limpiar" && player.admin) {
            this.state.queue = [];
            this.adapter.sendAnnouncement("🧹 Cola limpiada manualmente por el Admin.", null, { color: 0xFFFF00 });
            return false;
        }

        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;

        // LÓGICA DE PISTAS (SPOILER CHECK)
        if (this.state.phase === "CLUES" && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id === currentGiverId) {
                const clueWord = message.trim().split(/\s+/)[0];
                if (clueWord && !this.containsSpoiler(clueWord, this.state.currentRound.footballer)) {
                    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord }));
                    return false;
                } else {
                    this.adapter.sendAnnouncement("❌ ¡No puedes decir el nombre del futbolista!", player.id, { color: 0xFF0000 });
                    return false;
                }
            }
        }

        const validation = (0, handler_1.validateCommand)(command, player, this.state, this.state.currentRound?.footballer);
        if (validation.valid && validation.action) {
            this.applyTransition((0, state_machine_1.transition)(this.state, validation.action));
        } else if (!validation.valid && command.type !== "REGULAR_MESSAGE") {
            this.adapter.sendAnnouncement(`❌ ${validation.error}`, player.id, { color: 0xff6b6b });
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
            setTimeout(() => {
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' }));
                this.adapter.stopGame(); // Detiene el juego visualmente al terminar
            }, 8000);
        }
    }

    executeSideEffects(effects) {
        for (const effect of effects) {
            switch (effect.type) {
                case 'ANNOUNCE_PUBLIC': 
                    this.adapter.sendAnnouncement(effect.message, null, effect.style); 
                    break;
                case 'ANNOUNCE_PRIVATE': 
                    this.adapter.sendAnnouncement(effect.message, effect.playerId, { color: 0xffff00 }); 
                    break;
                case 'SET_PHASE_TIMER': 
                    this.setPhaseTimer(effect.durationSeconds); 
                    break;
                case 'CLEAR_TIMER': 
                    this.clearPhaseTimer(); 
                    break;
                case 'AUTO_START_GAME': 
                    // VALIDACIÓN FINAL: Solo iniciar si los 5 están presentes
                    const actualInRoom = this.state.queue.filter(id => this.state.players.has(id));
                    if (actualInRoom.length >= 5) {
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers }));
                    } else {
                        this.state.queue = actualInRoom; // Corregir cola
                        this.adapter.sendAnnouncement("⚠️ Error: Algunos jugadores ya no están. Reintentando...", null, {color: 0xFFCC00});
                    }
                    break;
            }
        }
    }

    containsSpoiler(clue, footballer) {
        const clueLower = clue.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const footballerLower = footballer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Verifica si la pista contiene partes del nombre (ej: "Messi" -> no puede decir "Mess")
        return footballerLower.split(/\s+/).some(part => part.length > 2 && clueLower.includes(part));
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        try {
            const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
            await this.adapter.stopGame();
            
            const allPlayers = await this.adapter.getPlayerList();
            for (const p of allPlayers) {
                if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0); // Todos a Spectators
            }

            for (const id of roundPlayerIds) {
                await this.adapter.setPlayerTeam(id, 1); // Jugadores a Red Team
            }

            await this.adapter.startGame();
            
            // Ubicar a los jugadores en los asientos
            for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
                await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { 
                    x: SEAT_POSITIONS[i].x, 
                    y: SEAT_POSITIONS[i].y, 
                    xspeed: 0, 
                    yspeed: 0 
                });
            }
        } catch (error) { 
            logger_1.gameLogger.error({ error }, 'Failed field setup'); 
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
