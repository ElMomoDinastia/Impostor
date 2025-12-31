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

// --- MODELO DE JUGADOR (Solo Log de Entrada) ---
const playerSchema = new mongoose_1.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    date: { type: Date, default: Date.now }
});
const PlayerDB = mongoose_1.default.models.Player || mongoose_1.default.model('Player', playerSchema, 'playerlogs');

const SEAT_POSITIONS = [
    { x: 0, y: -130 }, { x: 124, y: -40 }, { x: 76, y: 105 }, { x: -76, y: 105 }, { x: -124, y: -40 },
];

class GameController {
    adapter;
    state;
    footballers;
    phaseTimer = null;
    assignDelayTimer = null;

    constructor(adapter, footballers) {
        this.adapter = adapter;
        this.state = (0, types_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.adapter.setEventHandlers({
            onPlayerJoin: this.handlePlayerJoin.bind(this),
            onPlayerLeave: this.handlePlayerLeave.bind(this),
            onPlayerChat: this.handlePlayerChat.bind(this),
            onRoomLink: (link) => logger_1.gameLogger.info({ link }, 'Room ready'),
        });
    }

    handlePlayerJoin(player) {
        // --- GUARDADO SILENCIOSO EN DB ---
        if (mongoose_1.default.connection.readyState === 1) {
            PlayerDB.create({
                name: player.name,
                auth: player.auth,
                conn: player.conn,
                room: config_1.config.roomName
            }).catch(err => logger_1.gameLogger.error("Error logueando player:", err.message));
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
        const command = (0, handler_1.parseCommand)(message);
        const isAdmin = player.admin;

        // Gestión de espectadores y muertos (Ghosts)
        const activePhases = [types_1.GamePhase.CLUES, types_1.GamePhase.DISCUSSION, types_1.GamePhase.VOTING, types_1.GamePhase.REVEAL];
        if (activePhases.includes(this.state.phase) && this.state.currentRound) {
            if (!this.isPlayerInRound(player.id) && !isAdmin) {
                if (command?.type === handler_1.CommandType.JOIN) {
                    if (!this.state.queue.includes(player.id)) {
                        this.state.queue = [...this.state.queue, player.id];
                        this.adapter.sendAnnouncement(`✅ ${player.name} anotado para la próxima`, null, { color: 0x00ff00 });
                    }
                }
                return false; // Silenciar chat a los que no juegan
            }
        }

        // Fase de Pistas y Spoilers
        if (this.state.phase === types_1.GamePhase.CLUES && this.state.currentRound) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id !== currentGiverId && !isAdmin) return false;

            const clueWord = message.trim().split(/\s+/)[0];
            if (clueWord) {
                if (this.containsSpoiler(clueWord, this.state.currentRound.footballer)) {
                    this.adapter.sendAnnouncement('❌ ¡No puedes decir el nombre del futbolista!', player.id, { color: 0xff6b6b });
                    return false;
                }
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: clueWord }));
                return false;
            }
        }

        // Procesar Comandos (!start, !v, etc)
        if (command && command.type !== handler_1.CommandType.REGULAR_MESSAGE) {
            const validation = (0, handler_1.validateCommand)(command, player, this.state, this.state.currentRound?.footballer);
            if (validation.valid && validation.action) {
                if (validation.action.type === 'START_GAME') validation.action.footballers = this.footballers;
                this.applyTransition((0, state_machine_1.transition)(this.state, validation.action));
            } else if (validation.error) {
                this.adapter.sendAnnouncement(`❌ ${validation.error}`, player.id, { color: 0xff6b6b });
            }
            return false;
        }

        // Chat normal (si no es comando y puede hablar)
        this.adapter.sendAnnouncement(`${player.name}: ${message}`, null, { color: 0xffffff });
        return false;
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);
        
        // Manejo automático de transiciones de fase
        if (this.state.phase === types_1.GamePhase.ASSIGN) {
            this.setupGameField();
            this.assignDelayTimer = setTimeout(() => {
                this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
            }, 3000);
        }
        if (this.state.phase === types_1.GamePhase.REVEAL) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' })), 4000);
        }
        if (this.state.phase === types_1.GamePhase.RESULTS) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' })), 8000);
        }
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        const roundIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
        try {
            await this.adapter.stopGame();
            const players = await this.adapter.getPlayerList();
            // Todos a espectadores
            for (const p of players) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
            // Solo los de la ronda a equipo rojo
            for (const id of roundIds) {
                await this.adapter.setPlayerTeam(id, 1);
                await new Promise(r => setTimeout(r, 50));
            }
            await this.adapter.startGame();
            await new Promise(r => setTimeout(r, 500));
            // Sentar en posiciones
            roundIds.forEach((id, i) => {
                if (SEAT_POSITIONS[i]) {
                    this.adapter.setPlayerDiscProperties(id, { 
                        x: SEAT_POSITIONS[i].x, 
                        y: SEAT_POSITIONS[i].y, 
                        xspeed: 0, 
                        yspeed: 0 
                    });
                }
            });
        } catch (e) {
            logger_1.gameLogger.error("Error al configurar campo:", e);
        }
    }

    executeSideEffects(effects) {
        if (!effects) return;
        for (const e of effects) {
            switch (e.type) {
                case 'ANNOUNCE_PUBLIC': this.adapter.sendAnnouncement(e.message, null, e.style); break;
                case 'ANNOUNCE_PRIVATE': this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xffff00 }); break;
                case 'SET_PHASE_TIMER': this.setPhaseTimer(e.durationSeconds); break;
                case 'CLEAR_TIMER': this.clearPhaseTimer(); break;
                case 'AUTO_START_GAME': 
                    setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers })), 2000);
                    break;
            }
        }
    }

    containsSpoiler(clue, foot) {
        if (!foot) return false;
        const n = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const c = n(clue);
        return n(foot).split(/\s+/).some(p => p.length > 2 && c.includes(p));
    }

    setPhaseTimer(sec) {
        this.clearPhaseTimer();
        this.phaseTimer = setTimeout(() => {
            let type = null;
            if (this.state.phase === types_1.GamePhase.CLUES) type = 'CLUE_TIMEOUT';
            else if (this.state.phase === types_1.GamePhase.DISCUSSION) type = 'END_DISCUSSION';
            else if (this.state.phase === types_1.GamePhase.VOTING) type = 'END_VOTING';
            
            if (type) this.applyTransition((0, state_machine_1.transition)(this.state, { type }));
        }, sec * 1000);
    }

    clearPhaseTimer() {
        if (this.phaseTimer) clearTimeout(this.phaseTimer);
        if (this.assignDelayTimer) clearTimeout(this.assignDelayTimer);
        this.phaseTimer = this.assignDelayTimer = null;
    }

    // --- GETTERS PARA HEALTH SERVER ---
    isPlayerInRound(id) { return this.state.currentRound?.clueOrder.includes(id) ?? false; }
    getPlayerCount() { return this.state.players.size; }
    getQueueCount() { return this.state.queue.length; }
    getCurrentPhase() { return this.state.phase; }
    getRoundsPlayed() { return this.state.roundHistory?.length ?? 0; }
    isRoomInitialized() { return this.adapter.isInitialized(); }
    getRoomLink() { return this.adapter.getRoomLink(); }
    
    async start() { await this.adapter.initialize(); }
    stop() { this.clearPhaseTimer(); this.adapter.close(); }
}

exports.GameController = GameController;
