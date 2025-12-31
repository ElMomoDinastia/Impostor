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
const types_1 = require("../game/types"); // Importante para las comparaciones de fase
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
        // Limpieza de nombres duplicados
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
        const msg = message.trim();
        const msgLower = msg.toLowerCase();
        const phase = this.state.phase;
        const round = this.state.currentRound;

        // 1. COMANDOS DE ADMIN
        if (msgLower === "!limpiar" && player.admin) {
            this.state.queue = [];
            this.adapter.sendAnnouncement("🧹 Cola vaciada por Admin.", null, { color: 0xFFFF00 });
            return false;
        }

        // 2. PROCESAR COMANDOS (jugar, salir, !, etc)
        const command = (0, handler_1.parseCommand)(message);
        
        // Si es un comando reconocido por el handler (que no sea un mensaje regular)
        if (command && command.type !== "REGULAR_MESSAGE") {
            const validation = (0, handler_1.validateCommand)(command, player, this.state, round?.footballer);
            if (validation.valid && validation.action) {
                this.applyTransition((0, state_machine_1.transition)(this.state, validation.action));
            } else if (!validation.valid) {
                this.adapter.sendAnnouncement(`❌ ${validation.error}`, player.id, { color: 0xff6b6b });
            }
            return false; // Bloqueamos el texto del comando
        }

        // 3. CHAT LIBRE (WAITING, RESULTS, DISCUSSION)
        // Usamos las constantes del enum para evitar errores de string
        if (phase === types_1.GamePhase.WAITING || phase === types_1.GamePhase.RESULTS) {
            return true; // Chat totalmente libre
        }

        if (phase === types_1.GamePhase.DISCUSSION) {
            const isPlaying = round && (round.impostorId === player.id || round.normalPlayerIds.includes(player.id));
            if (isPlaying) return true;
            
            this.adapter.sendAnnouncement("🙊 Solo los jugadores activos debaten.", player.id, { color: 0xAAAAAA });
            return false;
        }

        // 4. LOGICA DE PARTIDA (PISTAS Y VOTOS)
        if (phase === types_1.GamePhase.CLUES && round) {
            const currentGiverId = round.clueOrder[round.currentClueIndex];
            if (player.id === currentGiverId) {
                const clueWord = msg.split(/\s+/)[0];
                if (clueWord && !this.containsSpoiler(clueWord, round.footballer)) {
                    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord }));
                } else {
                    this.adapter.sendAnnouncement("❌ No puedes decir el nombre.", player.id, { color: 0xFF0000 });
                }
            }
            return false; // Siempre oculto en pistas
        }

        if (phase === types_1.GamePhase.VOTING) {
            const isPlaying = round && (round.impostorId === player.id || round.normalPlayerIds.includes(player.id));
            const votedId = parseInt(msg);
            if (!isNaN(votedId) && isPlaying) {
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_VOTE', playerId: player.id, votedId: votedId }));
            }
            return false; // Siempre oculto en votación
        }

        return false; // Por defecto bloqueado en otras fases (como ASSIGN)
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

        if (this.state.phase === types_1.GamePhase.RESULTS) {
            setTimeout(() => {
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' }));
                this.adapter.stopGame();
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
                    const actualInRoom = this.state.queue.filter(id => this.state.players.has(id));
                    if (actualInRoom.length >= 5) {
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers }));
                    }
                    break;
            }
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
            await this.adapter.stopGame();
            const allPlayers = await this.adapter.getPlayerList();
            for (const p of allPlayers) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
            for (const id of roundPlayerIds) await this.adapter.setPlayerTeam(id, 1);
            await this.adapter.startGame();
            for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
                await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
            }
        } catch (error) { logger_1.gameLogger.error({ error }, 'Field error'); }
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
        if (this.state.phase === types_1.GamePhase.CLUES) type = "CLUE_TIMEOUT";
        else if (this.state.phase === types_1.GamePhase.DISCUSSION) type = "END_DISCUSSION";
        else if (this.state.phase === types_1.GamePhase.VOTING) type = "END_VOTING";
        if (type) this.applyTransition((0, state_machine_1.transition)(this.state, { type }));
    }

    async start() {
        await this.adapter.initialize();
        this.announceTimer = setInterval(() => {
            this.adapter.sendAnnouncement("📢 Sala: 【 𝙏𝙚𝙡𝙚𝙚𝙨𝙚 】", null, { color: 0x00FF00 });
        }, 5 * 60 * 1000);
    }

    stop() { 
        this.clearPhaseTimer(); 
        this.adapter.close(); 
        if (this.announceTimer) clearInterval(this.announceTimer); 
    }
}
exports.GameController = GameController;
