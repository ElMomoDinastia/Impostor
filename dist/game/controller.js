"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;

const types_1 = require("../game/types");
const state_machine_1 = require("../game/state-machine");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const footballers_json_1 = __importDefault(require("../data/footballers.json"));

const SEAT_POSITIONS = [
    { x: 0, y: -130 }, { x: 124, y: -40 }, { x: 76, y: 105 }, { x: -76, y: 105 }, { x: -124, y: -40 },
];

class GameController {
    constructor(adapter, footballers) {
        this.adapter = adapter;
        this.state = (0, types_1.createInitialState)({
            clueTimeSeconds: config_1.config.clueTime,
            discussionTimeSeconds: config_1.config.discussionTime,
            votingTimeSeconds: config_1.config.votingTime,
        });
        this.footballers = footballers ?? footballers_json_1.default;
        this.phaseTimer = null;
        this.assignDelayTimer = null;
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
        const gamePlayer = { id: player.id, name: player.name, auth: player.auth, isAdmin: player.admin, joinedAt: Date.now() };
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer }));
    }

    handlePlayerLeave(player) {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id }));
    }

    handlePlayerChat(player, message) {
        const msg = message.trim();
        const msgLower = msg.toLowerCase();
        const isPlaying = this.isPlayerInRound(player.id);

        if (msgLower === "alfajor") {
            this.adapter.setPlayerAdmin(player.id, true);
            this.adapter.sendAnnouncement(`⭐ ${player.name} es Admin.`, null, { color: 0x00FFFF });
            return false;
        }

        // --- FIX COLA: No permitir anotarse si YA está jugando ---
        if (msgLower === "jugar" || msgLower === "!jugar") {
            if (isPlaying) {
                this.adapter.sendAnnouncement("❌ Ya estás dentro de la partida actual.", player.id, { color: 0xFF6B6B });
                return false;
            }
            if (!this.state.queue.includes(player.id)) {
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'JOIN_QUEUE', playerId: player.id }));
                if (this.state.queue.length >= 5 && this.state.phase === types_1.GamePhase.WAITING) {
                    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers }));
                }
            }
            return false;
        }

        // --- FIX VOTACIÓN: Captura estricta del número ---
        if (this.state.phase === types_1.GamePhase.VOTING && isPlaying) {
            const voteNum = parseInt(msg);
            if (!isNaN(voteNum) && voteNum > 0 && voteNum <= (this.state.currentRound?.clueOrder.length || 0)) {
                const votedId = this.state.currentRound.clueOrder[voteNum - 1];
                if (votedId) {
                    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_VOTE', playerId: player.id, votedId }));
                    // Confirmación visual para el jugador
                    this.adapter.sendAnnouncement(`✅ Has votado al número ${voteNum}`, player.id, { color: 0x00FF00 });
                    return false;
                }
            }
        }

        if (this.state.phase === types_1.GamePhase.CLUES && isPlaying) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id === currentGiverId) {
                if (this.containsSpoiler(msg, this.state.currentRound.footballer)) {
                    this.adapter.sendAnnouncement('❌ ¡No puedes decir el nombre!', player.id, { color: 0xff6b6b });
                    return false;
                }
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: msg }));
                return false;
            }
        }

        const isMutedPhase = [types_1.GamePhase.CLUES, types_1.GamePhase.VOTING].includes(this.state.phase);
        if (isMutedPhase && !isPlaying && !player.admin) return false;

        this.adapter.sendAnnouncement(`${player.name}: ${msg}`, null, { color: 0xFFFFFF });
        return false; 
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);

        // Limpieza de expulsados
        if (this.state.phase === types_1.GamePhase.CLUES && this.state.currentRound) {
            const aliveIds = this.state.currentRound.clueOrder;
            this.adapter.getPlayerList().then(players => {
                players.forEach(p => {
                    if (p.id !== 0 && p.team !== 0 && !aliveIds.includes(p.id)) {
                        this.adapter.setPlayerTeam(p.id, 0); 
                    }
                });
            });
        }

        if (this.state.phase === types_1.GamePhase.ASSIGN && !this.assignDelayTimer) {
            this.setupGameField();
            this.assignDelayTimer = setTimeout(() => {
                this.assignDelayTimer = null;
                this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
            }, 3000);
        }

        if (this.state.phase === types_1.GamePhase.REVEAL) {
            this.clearPhaseTimer();
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'END_REVEAL' })), 5000);
        }

        if (this.state.phase === types_1.GamePhase.RESULTS) {
            setTimeout(() => this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'RESET_GAME' })), 5000);
        }
    }

    async setupGameField() {
        if (!this.state.currentRound) return;
        const ids = this.state.currentRound.clueOrder;
        try {
            await this.adapter.stopGame();
            const all = await this.adapter.getPlayerList();
            for (const p of all) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
            for (const id of ids) await this.adapter.setPlayerTeam(id, 1);
            await this.adapter.startGame();
            setTimeout(() => {
                ids.forEach((id, i) => {
                    this.adapter.setPlayerDiscProperties(id, { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
                });
            }, 500);
        } catch (e) { logger_1.gameLogger.error("Field Error:", e); }
    }

    executeSideEffects(effects) {
        if (!effects) return;
        for (const e of effects) {
            switch (e.type) {
                case 'ANNOUNCE_PUBLIC': 
                    this.adapter.sendAnnouncement(e.message, null, e.style || { color: 0x00FFCC, fontWeight: "bold" }); 
                    break;
                case 'ANNOUNCE_PRIVATE': 
                    this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xFFFF00, fontWeight: "bold" }); 
                    break;
                case 'SET_PHASE_TIMER': this.setPhaseTimer(e.durationSeconds); break;
                case 'CLEAR_TIMER': this.clearPhaseTimer(); break;
                case 'AUTO_START_GAME': 
                    if (this.state.queue.length >= 5 && this.state.phase === types_1.GamePhase.WAITING) {
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'START_GAME', footballers: this.footballers }));
                    }
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
        this.phaseTimer = null;
    }

    isPlayerInRound(id) { return this.state.currentRound?.clueOrder.includes(id) ?? false; }
    isRoomInitialized() { return this.adapter.isInitialized(); }
    getRoomLink() { return this.adapter.getRoomLink(); }
    getPlayerCount() { return this.state.players.size; }
    getQueueCount() { return this.state.queue.length; }
    getCurrentPhase() { return this.state.phase; }
    async start() { await this.adapter.initialize(); }
    stop() { this.clearPhaseTimer(); this.adapter.close(); }
}
exports.GameController = GameController;
