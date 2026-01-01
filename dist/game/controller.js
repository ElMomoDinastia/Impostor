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
            onRoomLink: (link) => {
                logger_1.gameLogger.info({ link }, 'Room ready');
                
                // --- ANUNCIO DE AUTORÍA FACHERO ---
                setTimeout(() => {
                    this.adapter.sendAnnouncement(" ", null); 
                    this.adapter.sendAnnouncement("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓", null, { color: 0x00FFCC });
                    this.adapter.sendAnnouncement("   SALA CREADA POR: 🆃🅴🅻🅴🅴🆂🅴   ", null, { color: 0x00FFCC, fontWeight: "bold" });
                    this.adapter.sendAnnouncement("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛", null, { color: 0x00FFCC });
                }, 2000);
            },
        });
    }

    handlePlayerJoin(player) {
        const gamePlayer = { id: player.id, name: player.name, auth: player.auth, isAdmin: player.admin, joinedAt: Date.now() };
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_JOIN', player: gamePlayer }));
    }

handlePlayerLeave(player) {
    // 1. Limpieza de seguridad: lo borramos de la cola de espera de inmediato
    this.state.queue = this.state.queue.filter(id => id !== player.id);

    // 2. Chequeamos si estaba en la partida ANTES de que el motor lo borre
    const estabaJugando = this.isPlayerInRound(player.id);
    const idDelQueTieneQueHablar = this.state.currentRound?.clueOrder[this.state.currentRound.currentClueIndex];

    // 3. Aplicamos la transición al motor lógico
    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'PLAYER_LEAVE', playerId: player.id }));

    // 4. Lógica de cancelación o salto de turno
    if (this.state.phase !== types_1.GamePhase.WAITING && estabaJugando) {
        
        // Usamos la lista de jugadores que el motor dejó después del LEAVE
        const vivosAhora = this.state.currentRound?.clueOrder.length || 0;

        // Si quedan menos de 3, RESET TOTAL
        if (vivosAhora < 3) {
            this.clearPhaseTimer();
            this.state.phase = types_1.GamePhase.WAITING;
            this.state.currentRound = null;
            // No reseteamos la queue aquí para dejar que los que quedaron se vuelvan a anotar
            
            this.adapter.stopGame(); 
            this.adapter.sendAnnouncement("❌ PARTIDA CANCELADA: Pocos jugadores activos.", null, { color: 0xFF4444, fontWeight: "bold" });
            this.adapter.sendAnnouncement("⚽ Escriban !jugar para iniciar otra.", null, { color: 0x00FFCC });
        } else {
            // Si la partida sigue, pero el que se fue tenía que dar la pista JUSTO AHORA:
            if (this.state.phase === types_1.GamePhase.CLUES && player.id === idDelQueTieneQueHablar) {
                this.adapter.sendAnnouncement(`🏃 @${player.name.toUpperCase()} se fue en su turno. Saltando...`, null, { color: 0xFFFF00 });
                this.clearPhaseTimer();
                this.setPhaseTimer(0.5); // Salto casi instantáneo al siguiente
            } else {
                this.adapter.sendAnnouncement(`🏃 @${player.name.toUpperCase()} abandonó la partida.`, null, { color: 0xCCCCCC });
            }
        }
    }
}

    handlePlayerChat(player, message) {
        const msg = message.trim();
        const msgLower = msg.toLowerCase();
        const isPlaying = this.isPlayerInRound(player.id);

        // --- Huevo de pascua Admin ---
        if (msgLower === "alfajor") {
            this.adapter.setPlayerAdmin(player.id, true);
            this.adapter.sendAnnouncement(`⭐ @${player.name.toUpperCase()} AHORA ES ADMIN`, null, { color: 0x00FFFF, fontWeight: "bold" });
            return false;
        }

        // --- Registro al Juego ---
        if (msgLower === "jugar" || msgLower === "!jugar") {
            if (isPlaying) {
                this.adapter.sendAnnouncement("❌ Ya estás en la partida actual.", player.id, { color: 0xFF4444 });
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

        // --- Sistema de Votación ---
        if (this.state.phase === types_1.GamePhase.VOTING && isPlaying) {
            const voteNum = parseInt(msg);
            if (!isNaN(voteNum) && voteNum > 0 && voteNum <= (this.state.currentRound?.clueOrder.length || 0)) {
                const votedId = this.state.currentRound.clueOrder[voteNum - 1];
                if (votedId) {
                    this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_VOTE', playerId: player.id, votedId }));
                    this.adapter.sendAnnouncement(`🎯 Has votado al [ ${voteNum} ]`, player.id, { color: 0x00FF00, fontWeight: "bold" });
                    return false;
                }
            }
        }

        // --- Entrega de Pistas ---
        if (this.state.phase === types_1.GamePhase.CLUES && isPlaying) {
            const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
            if (player.id === currentGiverId) {
                if (this.containsSpoiler(msg, this.state.currentRound.footballer)) {
                    this.adapter.sendAnnouncement('⚠️ ¡NO DIGAS EL NOMBRE! Pista anulada.', player.id, { color: 0xFF4444, fontWeight: "bold" });
                    return false;
                }
                this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: player.id, clue: msg }));
                return false;
            }
        }

        // Silenciar chat durante fases críticas
        const isMutedPhase = [types_1.GamePhase.CLUES, types_1.GamePhase.VOTING].includes(this.state.phase);
        if (isMutedPhase && !isPlaying && !player.admin) return false;

        // --- FORMATO DE CHAT PERSONALIZADO ---
        let chatPrefix = "";
        let chatColor = 0xFFFFFF; 

        if (player.admin) {
            chatPrefix = "⭐ ";
            chatColor = 0x00FFFF;
        } else if (isPlaying) {
            chatPrefix = "👤 ";
            chatColor = 0xADFF2F;
        } else {
            chatPrefix = "👀 "; 
            chatColor = 0xCCCCCC;
        }

        this.adapter.sendAnnouncement(`${chatPrefix}${player.name}: ${msg}`, null, { color: chatColor });
        return false; 
    }

    applyTransition(result) {
        this.state = result.state;
        this.executeSideEffects(result.sideEffects);

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
            if (this.state.phase === types_1.GamePhase.CLUES) {
                const currentGiverId = this.state.currentRound?.clueOrder[this.state.currentRound.currentClueIndex];
                
                this.adapter.getPlayerList().then(players => {
                    const online = players.find(p => p.id === currentGiverId);
                    if (!online) {
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: currentGiverId, clue: "--- DESCONECTADO ---" }));
                    } else {
                        this.adapter.sendAnnouncement("⏰ TIEMPO AGOTADO.", null, { color: 0xFFA500 });
                        this.applyTransition((0, state_machine_1.transition)(this.state, { type: 'SUBMIT_CLUE', playerId: currentGiverId, clue: "--- NO DIO PISTA ---" }));
                    }
                });
                return;
            }
            
            let type = null;
            if (this.state.phase === types_1.GamePhase.DISCUSSION) type = 'END_DISCUSSION';
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
