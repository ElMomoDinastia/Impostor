"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.GameController = void 0;

const { createInitialState, transition, transitionToClues } = require("../game/state-machine");
const { parseCommand, validateCommand } = require("../commands/handler");
const { gameLogger } = require("../utils/logger");
const { config } = require("../config");
const { GamePhase } = require("../game/types");
const footballersJson = __importDefault(require("../data/footballers.json"));
const mongoose = __importDefault(require("mongoose"));

const PlayerLog = mongoose.default.model(
  "PlayerLog",
  new mongoose.default.Schema({
    name: String,
    auth: String,
    conn: String,
    room: String,
    timestamp: { type: Date, default: Date.now },
  })
);

class GameController {
  constructor(adapter, footballers) {
    this.adapter = adapter;
    this.phaseTimer = null;
    this.assignDelayTimer = null;
    this.announceTimer = null;

    this.state = createInitialState({
      minPlayers: 5,
      clueTimeSeconds: config.clueTime || 30,
      discussionTimeSeconds: config.discussionTime || 30,
      votingTimeSeconds: config.votingTime || 45,
    });

    this.footballers = footballers ?? footballersJson.default;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.adapter.setEventHandlers({
      onPlayerJoin: this.handlePlayerJoin.bind(this),
      onPlayerLeave: this.handlePlayerLeave.bind(this),
      onPlayerChat: this.handlePlayerChat.bind(this),
      onRoomLink: (link) => gameLogger.info({ link }, "Room ready"),
    });
  }

  async handlePlayerJoin(player) {
    for (const p of this.state.players.values()) {
      if (p.name.toLowerCase() === player.name.toLowerCase()) {
        this.adapter.kickPlayer(player.id, "Nombre duplicado");
        return;
      }
    }

    try {
      await PlayerLog.create({
        name: player.name,
        auth: player.auth,
        conn: player.conn,
        room: config.roomName,
      });
    } catch {}

    this.applyTransition(
      transition(this.state, {
        type: "PLAYER_JOIN",
        player: {
          id: player.id,
          name: player.name,
          auth: player.auth,
          isAdmin: player.admin,
          joinedAt: Date.now(),
        },
      })
    );
  }

  handlePlayerLeave(player) {
    this.applyTransition(
      transition(this.state, { type: "PLAYER_LEAVE", playerId: player.id })
    );
  }

  handlePlayerChat(player, message) {
    const msg = message.trim();
    const phase = this.state.phase;
    const round = this.state.currentRound;

    /* =====================
       ADMIN QUICK COMMAND
    ====================== */
    if (msg.toLowerCase() === "!limpiar" && player.admin) {
      this.state.queue = [];
      this.adapter.sendAnnouncement("🧹 Cola vaciada.", null, { color: 0xffff00 });
      return false;
    }

    /* =====================
       COMMAND HANDLING
    ====================== */
    const command = parseCommand(message);
    if (command && command.type !== "REGULAR_MESSAGE") {
      const validation = validateCommand(
        command,
        player,
        this.state,
        round?.footballer
      );

      if (validation.valid && validation.action) {
        this.applyTransition(transition(this.state, validation.action));
      } else if (!validation.valid) {
        this.adapter.sendAnnouncement(
          `❌ ${validation.error}`,
          player.id,
          { color: 0xff6b6b }
        );
      }
      return false;
    }

    /* =====================
       NO GAME → FREE CHAT
    ====================== */
    if (!round || phase === GamePhase.WAITING || phase === GamePhase.RESULTS) {
      return true;
    }

    /* =====================
       ACTIVE PLAYER CHECK
    ====================== */
    const isActive = this.isActiveRoundPlayer(player.id);

    if (!isActive) {
      this.adapter.sendAnnouncement(
        "🚫 Estás fuera de la partida. Escribí 'jugar' para la próxima.",
        player.id,
        { color: 0xaaaaaa }
      );
      return false;
    }

    /* =====================
       DISCUSSION → FREE TALK
    ====================== */
    if (phase === GamePhase.DISCUSSION) {
      return true;
    }

    /* =====================
       CLUES
    ====================== */
    if (phase === GamePhase.CLUES) {
      const currentId = round.clueOrder[round.currentClueIndex];
      if (player.id === currentId) {
        const clue = msg.split(/\s+/)[0];
        if (!this.containsSpoiler(clue, round.footballer)) {
          this.applyTransition(
            transition(this.state, {
              type: "SUBMIT_CLUE",
              playerId: player.id,
              clue,
            })
          );
        }
      }
      return false;
    }

    /* =====================
       VOTING
    ====================== */
    if (phase === GamePhase.VOTING) {
      const votedId = parseInt(msg, 10);
      if (!isNaN(votedId)) {
        this.applyTransition(
          transition(this.state, {
            type: "SUBMIT_VOTE",
            playerId: player.id,
            votedId,
          })
        );
      }
      return false;
    }

    return false;
  }

  /* =====================
     GAME STATE
  ====================== */

  applyTransition(result) {
    this.state = result.state;
    this.executeSideEffects(result.sideEffects);

    if (this.state.phase === GamePhase.ASSIGN) {
      this.setupGameField();
      this.assignDelayTimer = setTimeout(() => {
        this.applyTransition(transitionToClues(this.state));
      }, 3000);
    }

    if (this.state.phase === GamePhase.RESULTS) {
      setTimeout(() => {
        this.applyTransition(transition(this.state, { type: "RESET_GAME" }));
        this.adapter.stopGame();
      }, 8000);
    }
  }

  executeSideEffects(effects) {
    for (const e of effects) {
      if (e.type === "ANNOUNCE_PUBLIC") this.adapter.sendAnnouncement(e.message);
      if (e.type === "ANNOUNCE_PRIVATE")
        this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xffff00 });
      if (e.type === "SET_PHASE_TIMER") this.setPhaseTimer(e.durationSeconds);
      if (e.type === "CLEAR_TIMER") this.clearPhaseTimer();
      if (e.type === "AUTO_START_GAME") {
        const ready = this.state.queue.filter((id) => this.state.players.has(id));
        if (ready.length >= 5)
          this.applyTransition(
            transition(this.state, {
              type: "START_GAME",
              footballers: this.footballers,
            })
          );
      }
    }
  }

  /* =====================
     HELPERS
  ====================== */

  isActiveRoundPlayer(playerId) {
    const r = this.state.currentRound;
    if (!r) return false;
    return (
      r.impostorId === playerId ||
      r.normalPlayerIds.includes(playerId)
    );
  }

  containsSpoiler(clue, footballer) {
    const clean = (s) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return clean(footballer)
      .split(/\s+/)
      .some(p => p.length > 2 && clean(clue).includes(p));
  }

  async setupGameField() {
    if (!this.state.currentRound) return;
    try {
      const ids = [
        ...this.state.currentRound.normalPlayerIds,
        this.state.currentRound.impostorId,
      ];

      await this.adapter.stopGame();
      const players = await this.adapter.getPlayerList();

      for (const p of players)
        if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);

      for (const id of ids)
        await this.adapter.setPlayerTeam(id, 1);

      await this.adapter.startGame();
    } catch (e) {
      gameLogger.error(e);
    }
  }

  setPhaseTimer(seconds) {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(
      () => this.handlePhaseTimeout(),
      seconds * 1000
    );
  }

  clearPhaseTimer() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    if (this.assignDelayTimer) clearTimeout(this.assignDelayTimer);
  }

  handlePhaseTimeout() {
    const map = {
      [GamePhase.CLUES]: "CLUE_TIMEOUT",
      [GamePhase.DISCUSSION]: "END_DISCUSSION",
      [GamePhase.VOTING]: "END_VOTING",
    };
    const type = map[this.state.phase];
    if (type) this.applyTransition(transition(this.state, { type }));
  }

  async start() {
    await this.adapter.initialize();
    this.announceTimer = setInterval(() => {
      this.adapter.sendAnnouncement("📢 Sala: 【 𝙏𝙚𝙡𝙚𝙚𝙨𝙚 】");
    }, 5 * 60 * 1000);
  }

  stop() {
    this.clearPhaseTimer();
    this.adapter.close();
    if (this.announceTimer) clearInterval(this.announceTimer);
  }
}

exports.GameController = GameController;

