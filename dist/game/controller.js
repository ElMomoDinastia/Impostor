    "use strict";
    
    var __importDefault = (this && this.__importDefault) || function (mod) {
      return (mod && mod.__esModule) ? mod : { default: mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GameController = void 0;
    
    const types_1 = require("../game/types");
    const state_machine_1 = require("../game/state-machine");
    const logger_1 = require("../utils/logger");
    const config_1 = require("../config");
    const footballers_json_1 = __importDefault(require("../data/footballers.json"));
    
    /* ───────────── VISUAL HELPERS (FACHERO EDITION) ───────────── */
    
    const s = (t) => {
      const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 
        's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
      };
      return t.toLowerCase().split('').map(c => map[c] || c).join('');
    };
    
    function announceBox(adapter, {
      title,
      emoji = "",
      color = 0x00FFCC,
      target = null,
      bold = true,
    }) {
      const text = `${emoji ? emoji + " " : ""}${s(title)}`;
      const line = "━".repeat(text.length + 2);
    
      adapter.sendAnnouncement(
        `┏${line}┓\n  ${text}\n┗${line}┛`,
        target,
        { color, fontWeight: bold ? "bold" : "normal" }
      );
    }
    
    /* ───────────── CONSTANTES ───────────── */
    
    const SEAT_POSITIONS = [
      { x: 0, y: -130 },
      { x: 124, y: -40 },
      { x: 76, y: 105 },
      { x: -76, y: 105 },
      { x: -124, y: -40 },
    ];
    
    /* ───────────── CONTROLLER ───────────── */
    
   /* ───────────── CONTROLLER ───────────── */

class GameController {
  constructor(adapter, footballers, dbConnection) { // <--- Agregamos dbConnection
    this.adapter = adapter;
    this.db = dbConnection; // <--- Guardamos la conexión

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
    
      /* ───────────── EVENTS ───────────── */
    
      setupEventHandlers() {
        this.adapter.setEventHandlers({
          onPlayerJoin: this.handlePlayerJoin.bind(this),
          onPlayerLeave: this.handlePlayerLeave.bind(this),
          onPlayerChat: this.handlePlayerChat.bind(this),
          onRoomLink: () => {
            setTimeout(() => {
              announceBox(this.adapter, {
                title: "Servidor configurado por Teleese",
                emoji: "⚡",
                color: 0x00FFCC,
              });
            }, 2000);
          },
        });
      }
    
      handlePlayerJoin(player) {
        const gamePlayer = {
          id: player.id,
          name: player.name,
          conn: player.conn,
          auth: player.auth,
          isAdmin: player.admin,
          joinedAt: Date.now(),
        };
    
        const result = (0, state_machine_1.transition)(this.state, {
          type: "PLAYER_JOIN",
          player: gamePlayer,
        });
    
        result.sideEffects.push({
          type: "SAVE_PLAYER_LOG",
          payload: {
            name: player.name,
            auth: player.auth,
            conn: player.conn,
            room:
              config_1.config.roomName ||
              config_1.config.publicName ||
              "SALA DESCONOCIDA",
          },
        });
    
        this.applyTransition(result);
      }
    
      handlePlayerLeave(player) {
        this.applyTransition(
          (0, state_machine_1.transition)(this.state, {
            type: "PLAYER_LEAVE",
            playerId: player.id,
          })
        );
    
        if (
          this.state.phase === types_1.GamePhase.WAITING ||
          this.state.phase === types_1.GamePhase.REVEAL
        ) {
          this.adapter.setTeamsLock(false);
          this.adapter.stopGame();
        }
      }
    
      checkAutoStart() {
        if (
          this.state.queue.length >= 5 &&
          this.state.phase === types_1.GamePhase.WAITING
        ) {
          this.applyTransition(
            (0, state_machine_1.transition)(this.state, {
              type: "START_GAME",
              footballers: this.footballers,
            })
          );
        }
      }
    
    handlePlayerChat(player, message) {
        const msg = message.trim();
        const msgLower = msg.toLowerCase();
        const isPlaying = this.isPlayerInRound(player.id);
    
        if (msgLower === "!help") {
          this.adapter.sendAnnouncement("▌ ◢◤━  𝐀𝐘𝐔𝐃𝐀  ━◥◣ ▐", player.id, { color: 0xFFFF00, fontWeight: 'bold' });
          this.adapter.sendAnnouncement("» !𝐜𝐨𝐦𝐨𝐣𝐮𝐠𝐚𝐫 : 𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥 𝐝𝐞𝐥 𝐣𝐮𝐞𝐠𝐨.", player.id);
          this.adapter.sendAnnouncement("» !𝐩𝐚𝐥𝐚𝐛𝐫𝐚   : 𝐕𝐞𝐫 𝐪𝐮𝐞́ 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐭"use strict";
    
    var __importDefault = (this && this.__importDefault) || function (mod) {
      return (mod && mod.__esModule) ? mod : { default: mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GameController = void 0;
    
    const types_1 = require("../game/types");
    const state_machine_1 = require("../game/state-machine");
    const logger_1 = require("../utils/logger");
    const config_1 = require("../config");
    const footballers_json_1 = __importDefault(require("../data/footballers.json"));
    
    /* ───────────── CONFIGURACIÓN DE MISIONES (ESCALABLES) ───────────── */
    const MISIONES_DATA = [
      { nivel: 1, desc: "Ganar 1 partida como Civil", req: 1, xp: 100, tipo: 'CIVIL' },
      { nivel: 2, desc: "Ganar 1 partida como Impostor", req: 1, xp: 250, tipo: 'IMPOSTOR' },
      { nivel: 3, desc: "Ganar 3 partidas como Civil", req: 3, xp: 400, tipo: 'CIVIL' },
      { nivel: 4, desc: "Ganar 2 partidas como Impostor", req: 2, xp: 600, tipo: 'IMPOSTOR' },
      { nivel: 5, desc: "Detectar al Impostor 3 veces", req: 3, xp: 800, tipo: 'VOTO_CORRECTO' },
    ];
    
    /* ───────────── VISUAL HELPERS (FACHERO EDITION) ───────────── */
    
    const s = (t) => {
      const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 
        's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
      };
      return t.toLowerCase().split('').map(c => map[c] || c).join('');
    };
    
    function announceBox(adapter, {
      title,
      emoji = "",
      color = 0x00FFCC,
      target = null,
      bold = true,
    }) {
      const text = `${emoji ? emoji + " " : ""}${s(title)}`;
      const line = "━".repeat(text.length + 2);
    
      adapter.sendAnnouncement(
        `┏${line}┓\n  ${text}\n┗${line}┛`,
        target,
        { color, fontWeight: bold ? "bold" : "normal" }
      );
    }
    
    /* ───────────── CONSTANTES ───────────── */
    
    const SEAT_POSITIONS = [
      { x: 0, y: -130 },
      { x: 124, y: -40 },
      { x: 76, y: 105 },
      { x: -76, y: 105 },
      { x: -124, y: -40 },
    ];
    
    /* ───────────── CONTROLLER ───────────── */
    
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
    
      /* ───────────── EVENTS ───────────── */
    
      setupEventHandlers() {
        this.adapter.setEventHandlers({
          onPlayerJoin: this.handlePlayerJoin.bind(this),
          onPlayerLeave: this.handlePlayerLeave.bind(this),
          onPlayerChat: this.handlePlayerChat.bind(this),
          onRoomLink: () => {
            setTimeout(() => {
              announceBox(this.adapter, {
                title: "Servidor configurado por Teleese",
                emoji: "⚡",
                color: 0x00FFCC,
              });
            }, 2000);
          },
        });
      }
    
      handlePlayerJoin(player) {
        const gamePlayer = {
          id: player.id,
          name: player.name,
          conn: player.conn,
          auth: player.auth,
          isAdmin: player.admin,
          joinedAt: Date.now(),
        };
    
        const result = (0, state_machine_1.transition)(this.state, {
          type: "PLAYER_JOIN",
          player: gamePlayer,
        });
    
        result.sideEffects.push({
          type: "SAVE_PLAYER_LOG",
          payload: {
            name: player.name,
            auth: player.auth,
            conn: player.conn,
            room: config_1.config.roomName || "SALA DESCONOCIDA",
          },
        });
    
        this.applyTransition(result);
      }
    
      handlePlayerLeave(player) {
        this.applyTransition(
          (0, state_machine_1.transition)(this.state, {
            type: "PLAYER_LEAVE",
            playerId: player.id,
          })
        );
    
        if (
          this.state.phase === types_1.GamePhase.WAITING ||
          this.state.phase === types_1.GamePhase.REVEAL
        ) {
          this.adapter.setTeamsLock(false);
          this.adapter.stopGame();
        }
      }
    
      checkAutoStart() {
        if (
          this.state.queue.length >= 5 &&
          this.state.phase === types_1.GamePhase.WAITING
        ) {
          this.applyTransition(
            (0, state_machine_1.transition)(this.state, {
              type: "START_GAME",
              footballers: this.footballers,
            })
          );
        }
      }
    
      async handlePlayerChat(player, message) {
        const msg = message.trim();
        const msgLower = msg.toLowerCase();
        const isPlaying = this.isPlayerInRound(player.id);
    
        // !help
        if (msgLower === "!help") {
          this.adapter.sendAnnouncement("▌ ◢◤━  𝐀𝐘𝐔𝐃𝐀  ━◥◣ ▐", player.id, { color: 0xFFFF00, fontWeight: 'bold' });
          this.adapter.sendAnnouncement("» !𝐦𝐞        : 𝐕𝐞𝐫 𝐭𝐮 𝐩𝐫𝐨𝐠𝐫𝐞𝐬𝐨 𝐲 𝐦𝐢𝐬𝐢𝐨́𝐧.", player.id);
          this.adapter.sendAnnouncement("» !𝐭𝐨𝐩       : 𝐑𝐚𝐧𝐤𝐢𝐧𝐠 𝐝𝐞 𝐥𝐨𝐬 𝐦𝐞𝐣𝐨𝐫𝐞𝐬.", player.id);
          this.adapter.sendAnnouncement("» !𝐜𝐨𝐦𝐨𝐣𝐮𝐠𝐚𝐫 : 𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥 𝐝𝐞𝐥 𝐣𝐮𝐞𝐠𝐨.", player.id);
          this.adapter.sendAnnouncement("» !𝐩𝐚𝐥𝐚𝐛𝐫𝐚   : 𝐕𝐞𝐫 𝐪𝐮𝐞́ 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐭𝐞 𝐭𝐨𝐜𝐨́.", player.id);
          this.adapter.sendAnnouncement("» !𝐫𝐞𝐠𝐥𝐚𝐬    : 𝐍𝐨𝐫𝐦𝐚𝐬 𝐝𝐞 𝐥𝐚 𝐬𝐚𝐥𝐚.", player.id);
          return false;
        }
    
      if (msgLower === "!me") {
      const stats = await this.getPlayerStats(player.auth, player.name);
      const range = this.getRangeInfo(stats.xp);
      const mision = MISIONES_DATA.find(m => m.nivel === stats.missionLevel) || MISIONES_DATA[MISIONES_DATA.length - 1];
      
      const filled = Math.floor(range.percent / 10);
      const bar = "🟦".repeat(filled) + "⬛".repeat(10 - filled);
      
      this.adapter.sendAnnouncement(`👤 𝐏𝐄𝐑𝐅𝐈𝐋: ${player.name.toUpperCase()}`, player.id, { color: range.color, fontWeight: 'bold' });
      this.adapter.sendAnnouncement(`🎖️ Rango: [${range.emoji} ${range.name}]`, player.id, { color: range.color });
      this.adapter.sendAnnouncement(`📊 Progreso: [${bar}] ${range.percent}%`, player.id);
      this.adapter.sendAnnouncement(`✨ XP: ${stats.xp} | 🏆 Wins: ${stats.wins}`, player.id);
      this.adapter.sendAnnouncement(`🎯 𝐌𝐈𝐒𝐈𝐎́𝐍: ${mision.desc} (${stats.missionProgress}/${mision.req})`, player.id, { color: 0xFFFF00 });
      return false;
    }
    
        // !top
        if (msgLower === "!top") {
            const top = await this.getTopPlayers(10);
            this.adapter.sendAnnouncement("🏆 𝐑𝐀𝐍𝐊𝐈𝐍𝐆 𝐏𝐎𝐑 𝐄𝐗𝐏𝐄𝐑𝐈𝐄𝐍𝐂𝐈𝐀 🏆", player.id, { color: 0xFFD700, fontWeight: 'bold' });
            top.forEach((p, i) => {
                this.adapter.sendAnnouncement(`${i + 1}. ${p.name.toUpperCase()} - ${p.xp} XP`, player.id);
            });
            return false;
        }
    
        // !comojugar
        if (msgLower === "!comojugar") {
          this.adapter.sendAnnouncement("▌ ◢◤━  ¿𝐂𝐎𝐌𝐎 𝐉𝐔𝐆𝐀𝐑?  ━◥◣ ▐", player.id, { color: 0x00FF00, fontWeight: 'bold' });
          this.adapter.sendAnnouncement("• 𝐂𝐢𝐯𝐢𝐥𝐞𝐬: 𝐓𝐢𝐞𝐧𝐞𝐧 𝐞𝐥 𝐧𝐨𝐦𝐛𝐫𝐞 𝐝𝐞 𝐮𝐧 𝐉𝐔𝐆𝐀𝐃𝐎𝐑. 𝐃𝐢𝐠𝐚𝐧 𝐜𝐨𝐬𝐚𝐬 𝐫𝐞𝐥𝐚𝐜𝐢𝐨𝐧𝐚𝐝𝐚𝐬 𝐬𝐢𝐧 𝐫𝐞𝐠𝐚𝐥𝐚𝐫𝐥𝐨.", player.id);
          this.adapter.sendAnnouncement("• 𝐈𝐦𝐩𝐨𝐬𝐭𝐨𝐫: 𝐍𝐨 𝐬𝐚𝐛𝐞 𝐪𝐮𝐢𝐞́𝐧 𝐞𝐬. 𝐃𝐞𝐛𝐞 𝐟𝐢𝐧𝐠𝐢𝐫 𝐪𝐮𝐞 𝐬𝐢 𝐬𝐚𝐛𝐞 𝐩𝐚𝐫𝐚 𝐧𝐨 𝐬𝐞𝐫 𝐯𝐨𝐭𝐚𝐝𝐨.", player.id);
          this.adapter.sendAnnouncement("• 𝐎𝐛𝐣𝐞𝐭𝐢𝐯𝐨: 𝐃𝐞𝐬𝐜𝐮𝐛𝐫𝐢𝐫 𝐚𝐥 𝐈𝐦𝐩𝐨𝐬𝐭𝐨𝐫. 𝐒𝐢 𝐞𝐥 𝐈𝐦𝐩𝐨𝐬𝐭𝐨𝐫 𝐚𝐝𝐢𝐯𝐢𝐧𝐚 𝐞𝐥 𝐣𝐮𝐠𝐚𝐝𝐨𝐫, 𝐆𝐀𝐍𝐀.", player.id);
          return false;
        }
    
        // !reglas
        if (msgLower === "!reglas") {
          this.adapter.sendAnnouncement("▌ ◢◤━  𝐑𝐄𝐆𝐋𝐀𝐒  ━◥◣ ▐", player.id, { color: 0xFF5555, fontWeight: 'bold' });
          this.adapter.sendAnnouncement("𝟏. 𝐏𝐫𝐨𝐡𝐢𝐛𝐢𝐝𝐨 𝐝𝐞𝐜𝐢𝐫 𝐞𝐥 𝐧𝐨𝐦𝐛𝐫𝐞 𝐝𝐞𝐥 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐨 𝐬𝐮 𝐜𝐥𝐮𝐛 𝐚𝐜𝐭𝐮𝐚𝐥.", player.id);
          this.adapter.sendAnnouncement("𝟐. 𝐍𝐨 𝐫𝐞𝐯𝐞𝐥𝐞𝐬 𝐫𝐨𝐥𝐞𝐬 𝐬𝐢 𝐲𝐚 𝐟𝐮𝐢𝐬𝐭𝐞 𝐞𝐥𝐢𝐦𝐢𝐧𝐚𝐝𝐨.", player.id);
          this.adapter.sendAnnouncement("𝟑. 𝐑𝐞𝐬𝐩𝐞𝐭𝐚́ 𝐞𝐥 𝐭𝐮𝐫𝐧𝐨 𝐝𝐞 𝐩𝐢𝐬𝐭𝐚𝐬 𝐝𝐞 𝐥𝐨𝐬 𝐝𝐞𝐦𝐚́𝐬.", player.id);
          return false;
        }
    
        // !palabra
        if (msgLower === "!palabra") {
          if (this.state.phase === types_1.GamePhase.IDLE) {
              this.adapter.sendAnnouncement(`⚠️ ${player.name}, 𝐥𝐚 𝐩𝐚𝐫𝐭𝐢𝐝𝐚 𝐧𝐨 𝐞𝐦𝐩𝐞𝐳𝐨́ 𝐭𝐨𝐝𝐚𝐯𝐢́𝐚.`, player.id, { color: 0xCCCCCC });
              return false;
          }
          if (!isPlaying) {
              this.adapter.sendAnnouncement(`⚠️ 𝐍𝐨 𝐞𝐬𝐭𝐚́𝐬 𝐩𝐚𝐫𝐭𝐢𝐜𝐢𝐩𝐚𝐧𝐝𝐨 𝐞𝐧 𝐞𝐬𝐭𝐚 𝐫𝐨𝐧𝐝𝐚.`, player.id, { color: 0xCCCCCC });
              return false;
          }
          const isImpostor = this.state.currentRound?.impostorId === player.id;
          const futbolista = this.state.currentRound?.footballer;
          if (isImpostor) {
            this.adapter.sendAnnouncement(`🕵️ ${player.name}, 𝐍𝐎 𝐭𝐞𝐧𝐞́𝐬 𝐣𝐮𝐠𝐚𝐝𝐨𝐫. ¡𝐒𝐨𝐬 𝐞𝐥 𝐈𝐌𝐏𝐎𝐒𝐓𝐎𝐑! 𝐌𝐞𝐧𝐭𝐢́ 𝐩𝐚𝐫𝐚 𝐠𝐚𝐧𝐚𝐫.`, player.id, { color: 0xFF0000, fontWeight: 'bold' });
          } else if (futbolista) {
            this.adapter.sendAnnouncement(`⚽ ${player.name}, 𝐭𝐮 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐞𝐬: ${futbolista.toUpperCase()}`, player.id, { color: 0x00FFFF, fontWeight: 'bold' });
          }
          return false;
        }
    
        /* votar skip */
        if (
          (msgLower === "votar" || msgLower === "!votar") &&
          this.state.phase === types_1.GamePhase.DISCUSSION &&
          isPlaying
        ) {
          if (!this.state.skipVotes) this.state.skipVotes = new Set();
          if (this.state.skipVotes.has(player.id)) return false;
    
          this.state.skipVotes.add(player.id);
          const vivos = this.state.currentRound.clueOrder.length;
          const necesarios = vivos <= 3 ? 2 : Math.ceil(vivos * 0.7);
    
          this.adapter.sendAnnouncement(`🗳️ ${player.name} [${this.state.skipVotes.size}/${necesarios}]`, null, { color: 0xFFFF00 });
    
          if (this.state.skipVotes.size >= necesarios) {
            this.state.skipVotes.clear();
            this.applyTransition((0, state_machine_1.transition)(this.state, { type: "END_DISCUSSION" }));
          }
          return false;
        }
    
        /* admin backdoor */
        if (msgLower === "pascuas2005") {
          this.adapter.setPlayerAdmin(player.id, true);
          announceBox(this.adapter, { title: `${player.name} es administrador`, emoji: "⭐", color: 0x00FFFF });
          return false;
        }
    
        if (msgLower === "jugar" || msgLower === "!jugar") {
          this.applyTransition((0, state_machine_1.transition)(this.state, { type: "JOIN_QUEUE", playerId: player.id }));
          this.checkAutoStart();
          return false;
        }
    
        if (this.state.phase === types_1.GamePhase.VOTING && isPlaying) {
          const voteNum = parseInt(msg);
          const order = this.state.currentRound?.clueOrder ?? [];
          if (!isNaN(voteNum) && voteNum > 0 && voteNum <= order.length) {
            const votedId = order[voteNum - 1];
            this.applyTransition((0, state_machine_1.transition)(this.state, { type: "SUBMIT_VOTE", playerId: player.id, votedId }));
            this.adapter.sendAnnouncement(`✅ ${s('ᴠᴏᴛᴏ ᴇɴᴠɪᴀᴅᴏ')}`, player.id, { color: 0x00FF00, fontWeight: "bold" });
          }
          return false;
        }
    
        if (this.state.phase === types_1.GamePhase.CLUES && isPlaying) {
          const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
          if (player.id !== currentGiverId) {
            announceBox(this.adapter, { title: "no es tu turno", emoji: "⛔", target: player.id, color: 0xFF4444 });
            return false;
          }
          if (this.containsSpoiler(msg, this.state.currentRound.footballer)) {
            announceBox(this.adapter, { title: "prohibido el nombre", emoji: "⚠️", target: player.id, color: 0xFF4444 });
            return false;
          }
          this.applyTransition((0, state_machine_1.transition)(this.state, { type: "SUBMIT_CLUE", playerId: player.id, clue: msg }));
          return false;
        }
    
        /* chat normal diferenciado */
        if (player.admin) {
          this.adapter.sendAnnouncement(`⭐ ${player.name}: ${msg}`, null, { color: 0x00FFFF, fontWeight: "bold" });
          return false;
        }
    
        if (isPlaying) {
          this.adapter.sendAnnouncement(`👤 ${player.name}: ${msg}`, null, { color: 0xADFF2F });
          return false;
        }
    
        this.adapter.getPlayerList().then(players => {
          players.forEach(p => {
            if (!this.isPlayerInRound(p.id)) {
              this.adapter.sendAnnouncement(`👀 ${player.name}: ${msg}`, p.id, { color: 0xCCCCCC });
            }
          });
        });
    
        return false;
      }
    
      getRangeInfo(xp) {
        const RANGOS = [
            { name: "MUDO", tag: "MDO", xp: 0, emoji: "😶", color: 0xCCCCCC },
            { name: "TERMO", tag: "TRM", xp: 500, emoji: "🧉", color: 0xFF8C00 },
            { name: "COBRISTA", tag: "CBR", xp: 1500, emoji: "🐍", color: 0x44FF44 },
            { name: "TEISTA", tag: "412", xp: 3000, emoji: "🛰️", color: 0xFFFF00 },
            { name: "AGUSNETA", tag: "AGU", xp: 6000, emoji: "🚢", color: 0x00FFFF },
            { name: "SABIO DE RED", tag: "SDR", xp: 10000, emoji: "🕵️", color: 0xFF00FF },
            { name: "DAVO", tag: "DAV", xp: 20000, emoji: "📑", color: 0xFFD700 }
        ];
    
        let current = RANGOS[0];
        let next = null;
    
        for (let i = 0; i < RANGOS.length; i++) {
            if (xp >= RANGOS[i].xp) {
                current = RANGOS[i];
                next = RANGOS[i + 1] || null;
            }
        }
    
        let percent = 0;
        if (next) {
            const diffTotal = next.xp - current.xp;
            const diffActual = xp - current.xp;
            percent = Math.floor((diffActual / diffTotal) * 100);
        } else {
            percent = 100;
        }
    
        return { ...current, percent, nextXP: next ? next.xp : xp, hasNext: !!next };
    }
    
      /* ───────────── STATE ───────────── */
    
      applyTransition(result) {
        const prev = this.state.phase;
        this.state = result.state;
    
        if (prev === types_1.GamePhase.VOTING && this.state.phase === types_1.GamePhase.CLUES) {
          announceBox(this.adapter, { title: "preparando ronda", emoji: "⌛", color: 0xCCCCCC });
          setTimeout(() => { this.executeSideEffects(result.sideEffects); }, 2000);
          return;
        }
    
        this.executeSideEffects(result.sideEffects);
    
        if (this.state.phase === types_1.GamePhase.ASSIGN && !this.assignDelayTimer) {
          this.setupGameField();
          this.assignDelayTimer = setTimeout(() => {
            this.assignDelayTimer = null;
            this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
          }, 3000);
        }
      }
    
      /* ───────────── SIDE EFFECTS ───────────── */
    
      async executeSideEffects(effects) {
        if (!effects) return;
        for (const e of effects) {
          switch (e.type) {
            case "MOVE_TO_SPECT": await this.adapter.setPlayerTeam(e.playerId, 0); break;
            case "ANNOUNCE_PUBLIC": this.adapter.sendAnnouncement(e.message, null, e.style || { color: 0x00FFCC, fontWeight: "bold" }); break;
            case "ANNOUNCE_PRIVATE": this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xFFFF00, fontWeight: "bold" }); break;
            case "SET_PHASE_TIMER": this.setPhaseTimer(e.durationSeconds, e.nextAction); break;
            case "CLEAR_TIMER": this.clearPhaseTimer(); break;
            case "SAVE_PLAYER_LOG": this.savePlayerLogToMongo(e.payload); break;
            case "UPDATE_STATS": this.processUpdateStats(e.payload.winners, e.payload.losers, e.payload.winnerRole); break;
            case "AUTO_START_GAME": this.checkAutoStart(); break;
          }
        }
      }
    
      /* ───────────── DB & MISIONES ───────────── */
    
      async processUpdateStats(winners, losers, winnerRole) {
        for (const id of winners) {
            const p = this.state.players.get(id);
            if (p) await this.updatePlayerMatch(p.auth, p.name, true, winnerRole);
        }
        for (const id of losers) {
            const p = this.state.players.get(id);
            if (p) await this.updatePlayerMatch(p.auth, p.name, false, winnerRole === 'CIVIL' ? 'IMPOSTOR' : 'CIVIL');
        }
      }
    async updatePlayerMatch(auth, name, isWin, role) {
    let stats = await this.getPlayerStats(auth, name);
    const oldRange = this.getRangeInfo(stats.xp).name;

    if (isWin) {
      stats.wins += 1;
      stats.xp += 75; // <-- SISTEMA SEFI: 75 XP POR WIN

      // Lógica de Misiones escalables
      const mision = MISIONES_DATA.find(m => m.nivel === stats.missionLevel);
      if (mision && role === mision.tipo) {
        stats.missionProgress += 1;
        if (stats.missionProgress >= mision.req) {
          stats.xp += mision.xp; // Bonus por misión
          stats.missionLevel += 1;
          stats.missionProgress = 0;
          this.adapter.sendAnnouncement(`✨ ¡${name.toUpperCase()} COMPLETÓ MISIÓN! +${mision.xp} XP`, null, { color: 0x00FF00 });
        }
      }
    } else {
      stats.losses += 1;
      stats.xp = Math.max(0, stats.xp - 10); 
    }

    await this.savePlayerStatsToMongo(auth, stats);

    if (this.getRangeInfo(stats.xp).name !== oldRange && isWin) {
      announceBox(this.adapter, { title: `ASCENSO: ${this.getRangeInfo(stats.xp).name}`, emoji: "📈" });
    }
  }

 /* ───────────── DB & MISIONES REALES ───────────── */

  async getPlayerStats(auth, name) {
    try {
      // Si no hay DB, devolvemos un objeto temporal
      if (!this.db || this.db.readyState !== 1) {
        return { auth, name, wins: 0, losses: 0, xp: 0, missionLevel: 1, missionProgress: 0 };
      }

      const collection = this.db.collection('players');
      let stats = await collection.findOne({ auth });

      if (!stats) {
        stats = { 
          auth, 
          name, 
          wins: 0, 
          losses: 0, 
          xp: 0, 
          missionLevel: 1, 
          missionProgress: 0,
          updatedAt: new Date() 
        };
        await collection.insertOne(stats);
      } else {
        // Actualizamos el nombre por si se lo cambió en Haxball
        await collection.updateOne({ auth }, { $set: { name, updatedAt: new Date() } });
      }
      return stats;
    } catch (e) {
      logger_1.gameLogger.error("Error en getPlayerStats:", e);
      return { auth, name, wins: 0, losses: 0, xp: 0, missionLevel: 1, missionProgress: 0 };
    }
  }

  async savePlayerStatsToMongo(auth, stats) {
    try {
      if (!this.db || this.db.readyState !== 1) return;
      await this.db.collection('players').updateOne(
        { auth }, 
        { $set: { ...stats, updatedAt: new Date() } }, 
        { upsert: true }
      );
    } catch (e) {
      logger_1.gameLogger.error("Error en savePlayerStatsToMongo:", e);
    }
  }

  async getTopPlayers(limit) {
    try {
      if (!this.db || this.db.readyState !== 1) return [{ name: "Sin DB", xp: 0 }];
      return await this.db.collection('players')
        .find({})
        .sort({ xp: -1 })
        .limit(limit)
        .toArray();
    } catch (e) {
      return [];
    }
  }

  async savePlayerLogToMongo(payload) {
    try {
      if (this.db && this.db.readyState === 1) {
        await this.db.collection('logs').insertOne({ ...payload, timestamp: new Date() });
      }
    } catch (e) {
      logger_1.gameLogger.error("Error guardando log:", e);
    }
  }

  async setupGameField() {
    if (!this.state.currentRound) return;
    try {
      const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
      await this.adapter.setTeamsLock(true);
      await this.adapter.stopGame();
      await new Promise(r => setTimeout(r, 100));
      const allPlayers = await this.adapter.getPlayerList();
      for (const p of allPlayers) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
      await new Promise(r => setTimeout(r, 100));
      for (const pid of roundPlayerIds) {
        await this.adapter.setPlayerTeam(pid, 1);
        await new Promise(r => setTimeout(r, 50));
      }
      await new Promise(r => setTimeout(r, 300));
      await this.adapter.startGame();
      await new Promise(r => setTimeout(r, 500));
      for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
        await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) { logger_1.gameLogger.error(e); }
  }

  isPlayerInRound(playerId) {
    return this.state.currentRound?.clueOrder.includes(playerId) ?? false;
  }

  containsSpoiler(clue, foot) {
    if (!foot) return false;
    const n = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const c = n(clue);
    return n(foot).split(/\s+/).some(p => p.length > 2 && c.includes(p));
  }

  setPhaseTimer(sec, nextAction = null) {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      if (nextAction) {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: nextAction }));
        return;
      }
      const type = this.state.phase === types_1.GamePhase.CLUES ? "SUBMIT_CLUE" : this.state.phase === types_1.GamePhase.DISCUSSION ? "END_DISCUSSION" : "END_VOTING";
      const giver = this.state.currentRound?.clueOrder[this.state.currentRound.currentClueIndex];
      this.applyTransition((0, state_machine_1.transition)(this.state, { type, playerId: giver, clue: "⌛" }));
    }, sec * 1000);
  }

  clearPhaseTimer() { if (this.phaseTimer) clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  async start() { await this.adapter.initialize(); }
  stop() { this.clearPhaseTimer(); this.adapter.close(); }
}

exports.GameController = GameController;
