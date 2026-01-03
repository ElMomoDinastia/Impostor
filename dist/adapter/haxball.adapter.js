"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HBRoomAdapter = void 0;
exports.createHBRoomAdapter = createHBRoomAdapter;

const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());

const logger_1 = require("../utils/logger");
const HAXBALL_HEADLESS_URL = 'https://www.haxball.com/headless';

class HBRoomAdapter {
    browser = null;
    page = null;
    roomLink = null;
    handlers = {};
    config;
    initialized = false;
    pollingInterval = null;

    constructor(config) {
        this.config = config;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            this.browser = await puppeteer_extra_1.default.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 720 });

            await this.page.goto(HAXBALL_HEADLESS_URL, { waitUntil: 'networkidle2' });
            await this.page.waitForFunction('typeof HBInit === "function"');

            const roomNumber = parseInt(this.config.roomNumber) || 0;
            const isHeader = String(this.config.isHeader) === 'true';
            const isFooter = String(this.config.isFooter) === 'true';
            const isDecorativo = isHeader || isFooter;

            let finalName = "";
            if (isHeader) {
                finalName = "▌ ◢◤━ 𝐓𝐄𝐋𝐄𝐄𝐒𝐄 𝐏𝐑𝐎𝐉𝐄𝐂𝐓 ━◥◣ ▐";
            } else if (isFooter) {
                finalName = "▌ ◥◣━ dsc.gg/chinocity ━◢◤ ▐";
            } else {
                const fancyNums = ["𝟬𝟬", "𝟬𝟭", "𝟬𝟮", "𝟬𝟯", "𝟬𝟰", "𝟬𝟱", "𝟬𝟲", "𝟬𝟳"];
                const n = fancyNums[roomNumber] ?? roomNumber.toString().padStart(2, "0");
                // ESTÉTICA: Usamos ◢◤ para que enganche con el Header de arriba
                finalName = `▌ ◢◤━   𝐈𝐌𝐏𝐎𝐒𝐓𝐎𝐑 ${n}   ━◥◣ ▐`;
            }

            const roomConfig = {
                roomName: finalName,
                maxPlayers: isDecorativo ? 2 : (this.config.maxPlayers || 15),
                noPlayer: false,
                token: (this.config.token || '').trim(),
                public: this.config.public ?? true,
                geo: { "code": "ar", "lat": -34.567, "lon": -58.466 + (roomNumber * 0.01) }
            };

            const roomLink = await this.page.evaluate(async (config, isDeco) => {
                return new Promise((resolve, reject) => {
                    const room = HBInit(config);
                    if (!room) return reject(new Error('HBInit fail'));
                    window.__haxRoom = room;
                    window.__haxEvents = [];
                    room.onRoomLink = (link) => resolve(link);
                    room.onPlayerJoin = (p) => {
                        if (isDeco) room.kickPlayer(p.id, "INFO", false);
                        else window.__haxEvents.push({ type: 'playerJoin', player: p });
                    };
                    room.onPlayerLeave = (p) => { if (!isDeco) window.__haxEvents.push({ type: 'playerLeave', player: p }); };
                    room.onPlayerChat = (p, m) => {
                        if (isDeco) return false;
                        window.__haxEvents.push({ type: 'playerChat', player: p, message: m });
                        return false;
                    };
                });
            }, roomConfig, isDecorativo);

            this.roomLink = roomLink;
            this.initialized = true;

            if (!isDecorativo) {
                await this.loadDefaultStadium();
                this.startEventPolling();
            }
            if (this.handlers.onRoomLink) this.handlers.onRoomLink(roomLink);
            
        } catch (error) {
            logger_1.roomLogger.error('Error inicializando:', error);
            await this.close();
            throw error;
        }
    }

    async getPlayerList() {
        return await this.page?.evaluate(() => {
            return window.__haxRoom ? window.__haxRoom.getPlayerList() : [];
        }) || [];
    }

    async setPlayerDiscProperties(id, props) {
        await this.page?.evaluate((i, p) => window.__haxRoom?.setPlayerDiscProperties(i, p), id, props);
    }

    async sendChat(msg, id) { await this.page?.evaluate((m, i) => window.__haxRoom?.sendChat(m, i), msg, id); }
    async sendAnnouncement(msg, tid, opts) { 
        await this.page?.evaluate((m, t, c, s) => window.__haxRoom?.sendAnnouncement(m, t, c, s), 
        msg, tid, opts?.color, opts?.fontWeight || opts?.style); 
    }
    async setPlayerTeam(id, t) { await this.page?.evaluate((i, team) => window.__haxRoom?.setPlayerTeam(i, team), id, t); }
    async startGame() { await this.page?.evaluate(() => window.__haxRoom?.startGame()); }
    async stopGame() { await this.page?.evaluate(() => window.__haxRoom?.stopGame()); }
    async setTeamsLock(l) { await this.page?.evaluate((locked) => window.__haxRoom?.setTeamsLock(locked), l); }
    async setPlayerAdmin(id, a) { await this.page?.evaluate((i, a) => window.__haxRoom?.setPlayerAdmin(i, a), id, a); }

    async loadDefaultStadium() {
        const stadium = JSON.stringify({
            "name": "Mesa Impostor by Teleese", "width": 400, "height": 400,
            "bg": { "type": "grass", "width": 400, "height": 400, "kickOffRadius": 0 },
            "discs": [
                { "pos": [0, -130], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                { "pos": [124, -40], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                { "pos": [76, 105], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                { "pos": [-76, 105], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                { "pos": [-124, -40], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                { "pos": [0, 0], "radius": 35, "invMass": 0, "color": "2D3748", "cGroup": ["wall"], "cMask": ["all"] }
            ],
            "spawnDistance": 0, "spawns": [{ "x": 0, "y": 0, "team": "red" }], "balls": [{ "pos": [0, 0], "color": "FFFFFF" }]
        });
        await this.page?.evaluate((s) => window.__haxRoom?.setCustomStadium(s), stadium);
    }

    startEventPolling() {
        this.pollingInterval = setInterval(async () => {
            try {
                const events = await this.page.evaluate(() => {
                    const evts = window.__haxEvents || [];
                    window.__haxEvents = [];
                    return evts;
                });
                events.forEach(e => {
                    if (e.type === 'playerJoin') this.handlers.onPlayerJoin?.(e.player);
                    if (e.type === 'playerLeave') this.handlers.onPlayerLeave?.(e.player);
                    if (e.type === 'playerChat') this.handlers.onPlayerChat?.(e.player, e.message);
                });
            } catch (err) {}
        }, 100);
    }

    setEventHandlers(h) { this.handlers = h; }
    async close() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.browser) await this.browser.close();
        this.initialized = false;
    }
}

exports.HBRoomAdapter = HBRoomAdapter;
function createHBRoomAdapter(config) { return new HBRoomAdapter(config); }
