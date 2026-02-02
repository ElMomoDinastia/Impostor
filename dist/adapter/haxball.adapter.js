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
            const fancyNums = ["0", "1", "2", "3", "4", "5"]; // Ahora son 6 posiciones

            if (roomNumber === 0) { 
            finalName = "🕵️🔴──── IMPOSTORES HAXBALL ────🔴🕵️ ";
            } else if (roomNumber === 5) { 
            finalName = "🕵️🔴──── IMPOSTORES HAXBALL ────🔴🕵️ ";
            } else {
   
            const n = fancyNums[roomNumber];    
            finalName = `🕵️🔴 Impostor #${n} | ADIVINÁ AL IMPOSTOR`;
}

            const roomConfig = {
                roomName: finalName,
                maxPlayers: isDecorativo ? 2 : (this.config.maxPlayers || 15),
                noPlayer: false,
                token: (this.config.token || '').trim(),
                public: this.config.public ?? true,
                geo: { "code": "ar", "lat": -34.5, "lon": -58.400 + (roomNumber * 0.0001) }
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

                    room.onPlayerLeave = (p) => { 
                        if (!isDeco) window.__haxEvents.push({ type: 'playerLeave', player: p }); 
                    };

                    room.onPlayerKicked = (target, reason, ban, admin) => {
                        if (!isDeco) {
                            window.__haxEvents.push({ 
                                type: 'playerKicked', 
                                target: target, 
                                reason: reason, 
                                ban: ban, 
                                admin: admin 
                            });
                        }
                    };

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

    async clearBans() { 
    await this.page?.evaluate(() => window.__haxRoom?.clearBans()); 
}

    
    async startRecording() { 
        await this.page?.evaluate(() => window.__haxRoom?.startRecording()); 
    }

    async stopRecording() {
        return await this.page?.evaluate(() => {
            const data = window.__haxRoom?.stopRecording();
            if (!data) return null;
            return Array.from(data);
        });
    }
    
async setTeamColors(team, angle, textColor, colors) {
        await this.page?.evaluate((t, a, tc, c) => {
            window.__haxRoom?.setTeamColors(t, a, tc, c);
        }, team, angle, textColor, colors);
    }

async kickPlayer(id, reason, ban) {
    await this.page?.evaluate((i, r, b) => window.__haxRoom?.kickPlayer(i, r, b), id, reason, ban);
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
    if (!this.page) return;
    try {
        const stadiumJson = JSON.stringify({
            "name": "Mesa Impostor by Zetaa",
            "width": 400,
            "height": 400,
            "spawnDistance": 0,
            "bg": {
                "type": "",
                "width": 400,
                "height": 400,
                "kickOffRadius": 0,
                "cornerRadius": 0,
                "color": "49556F"
            },
            "playerPhysics": {
                "radius": 15,
                "acceleration": 0,
                "kickingAcceleration": 0,
                "kickStrength": 12,
                "damping": 0.96,
                "invMass": 0.5,
                "kickingDamping": 0.96
            },
            "ballPhysics": {
                "radius": 10,
                "invMass": 0.5,
                "damping": 0.99,
                "color": "FFFFFF"
            },
            "vertexes": [
                { "x": -173.06311878102332, "y": -171.17918932002476 }, { "x": -196.2227931852575, "y": -164.74594642995964 }, { "x": -198.7960903412835, "y": -173.75248647605076 }, { "x": -178.20971309307538, "y": -180.61461222545347 }, { "x": -166.76433956342044, "y": -141.49731081266384 }, { "x": -140.2972152343301, "y": -149.05934633526113, "color": "000000" }, { "x": -160.6726998368838, "y": -127.32757072505359, "color": "000000" }, { "x": -137.9814066878008, "y": -134.8913351080812, "color": "000000" }, { "x": -138.30718869367468, "y": -175.7201021503056, "curve": -180 }, { "x": -138.1312202729615, "y": -156.85007679971136, "curve": -180 }, { "x": -138.01517686261792, "y": -156.97798031026502, "curve": -180 }, { "x": -138.12273360846626, "y": -175.8485196020706, "curve": -180 }, { "x": -138.13103488346053, "y": -159.47597593800424, "curve": -180 }, { "x": -137.9622904627712, "y": -173.26291504911046, "curve": -180 }, { "x": -137.8510109617456, "y": -173.16946536479168, "curve": -180 }, { "x": -137.95415219979185, "y": -159.382150754657, "curve": -180 }, { "x": -137.95114554985344, "y": -170.35671655832743, "curve": -180 }, { "x": -137.84751970210016, "y": -162.022455361815, "curve": -180 }, { "x": -137.77918302712004, "y": -162.07894607897617, "curve": -180 }, { "x": -137.84252199967523, "y": -170.41343426619028, "curve": -180 }, { "x": -137.7139163546339, "y": -168.8871698585359, "curve": -180 }, { "x": -137.6709188312019, "y": -163.66153751076922, "curve": -180 }, { "x": -137.64256386140022, "y": -163.6969575332506, "curve": -180 }, { "x": -137.6688451321029, "y": -168.92273220556467, "curve": -180 }, { "x": -140.03913861202267, "y": -170.75030646068706 }, { "x": -137.4658414559966, "y": -165.17482928929735 }, { "x": -179.90882604942874, "y": -163.71138208885088, "curve": -180 }, { "x": -179.73285762871558, "y": -144.84135673825654, "curve": -180 }, { "x": -179.61681421837199, "y": -144.9692602488102, "curve": -180 }, { "x": -179.72437096422033, "y": -163.8397995406158, "curve": -180 }, { "x": -179.7326722392146, "y": -147.46725587654942, "curve": -180 }, { "x": -179.56392781852526, "y": -161.25419498765564, "curve": -180 }, { "x": -179.45264831749967, "y": -161.16074530333685, "curve": -180 }, { "x": -179.55578955554586, "y": -147.37343069320218, "curve": -180 }, { "x": -179.5527829056075, "y": -158.3479964968726, "curve": -180 }, { "x": -179.44915705785422, "y": -150.01373530036017, "curve": -180 }, { "x": -179.3808203828741, "y": -150.07022601752135, "curve": -180 }, { "x": -179.4441593554293, "y": -158.40471420473546, "curve": -180 }, { "x": -179.31555371038792, "y": -156.8784497970811, "curve": -180 }, { "x": -179.27255618695597, "y": -151.6528174493144, "curve": -180 }, { "x": -179.24420121715428, "y": -151.6882374717958, "curve": -180 }, { "x": -179.27048248785695, "y": -156.91401214410996, "curve": -180 }, { "x": -181.64077596777673, "y": -158.74158639923223 }, { "x": -179.06747881175068, "y": -153.16610922784264 }, { "x": -141.22301999481266, "y": -146.23698168262274, "color": "000000" }, { "x": -164.99485091289955, "y": -138.67321729959508, "color": "000000" }, { "x": -136.2658752504501, "y": -137.81545158091973, "color": "000000" }, { "x": -162.8171141335721, "y": -129.71141831339014, "color": "000000" }, { "x": -166.20099303162056, "y": -139.4418577290371, "color": "000000" }, { "x": -160.19663300089314, "y": -131.2930834016214, "color": "000000" }, { "x": -141.0585824700205, "y": -147.39742450101176, "color": "000000" }, { "x": -143.10134871819946, "y": -137.18359326011682, "color": "000000" }, { "x": -164.2099332827155, "y": -138.20497638420636, "color": "000000" }, { "x": -156.37932933136278, "y": -133.09806076375895, "color": "000000" }, { "x": -140.3776603872942, "y": -148.75926866646432, "color": "000000" }, { "x": -139.35627726320473, "y": -137.52405430148002, "color": "000000" }, { "x": -157.74681697903702, "y": -128.03470236709938, "color": "000000" }, { "x": -141.26826289248692, "y": -131.4657652418008, "color": "FF78C3" }, { "x": -142.07996559410998, "y": -131.73621659830627 }, { "x": -157.74117349681546, "y": -127.99114514331154, "color": "000000" }, { "x": -153.31517995909434, "y": -127.6506841019484 }, { "x": -143.78227080092586, "y": -131.73621659830633 }, { "x": -152.97471891773114, "y": -125.60791785376944 }, { "x": -142.76088767683632, "y": -131.39575555694313 }, { "x": -199.572059521026, "y": -171.62961925421553, "color": "1F130C" }, { "x": -177.421035256445, "y": -178.65311475274132, "color": "1F130C" }, { "x": -200.11232840552805, "y": -171.08935036971354, "color": "1F130C" }, { "x": -176.3404974874411, "y": -178.11284586823922, "color": "1F130C" }, { "x": -197.8778555705045, "y": -169.55802583597983, "color": "1F130C" }, { "x": -175.0761096453591, "y": -175.4676610828625, "color": "1F130C" }, { "x": -197.72172848545404, "y": -166.7733752068723, "color": "1F130C" }, { "x": -173.51670529305886, "y": -172.14274156925285, "color": "1F130C" }, { "x": -131.0325985659316, "y": -183.18790938147947 }, { "x": -154.19227297016585, "y": -176.75466649141447 }, { "x": -156.76557012619185, "y": -185.7612065375056 }, { "x": -136.1791928779836, "y": -192.6233322869083 }, { "x": -157.5415393059343, "y": -183.63833931567035, "color": "1F130C" }, { "x": -135.3905150413533, "y": -190.66183481419603, "color": "1F130C" }, { "x": -158.08180819043628, "y": -183.09807043116837, "color": "1F130C" }, { "x": -134.30997727234933, "y": -190.12156592969404, "color": "1F130C" }, { "x": -155.84733535541272, "y": -181.56674589743466, "color": "1F130C" }, { "x": -133.0455894302674, "y": -187.4763811443172, "color": "1F130C" }, { "x": -155.69120827036232, "y": -178.782095268327, "color": "1F130C" }, { "x": -131.4861850779671, "y": -184.15146163070767, "color": "1F130C" }, { "x": -4.911170392010291, "y": 110.18462756807517, "curve": -180, "color": "FFCD38" }, { "x": -9.639890798225395, "y": 153.14204495221992, "color": "FFCD38" }, { "x": -16.103107795787423, "y": 193.66338066273036, "color": "FFCD38" }, { "x": -1.4011913275059271, "y": 153.8285825458925, "color": "FFCD38" }, { "x": -5.445406748341128, "y": 175.12027092053728, "color": "FFCD38" }, { "x": 6.627339203226342, "y": 177.1983302909685, "color": "FFCD38" }, { "x": 8.238217822301863, "y": 173.54161368679698, "color": "FFCD38" }, { "x": 14.70738222594585, "y": 176.35511174548347, "color": "FFCD38" }, { "x": 11.752857557536657, "y": 188.08541649138877, "color": "FFCD38" }, { "x": -5.973983515561287, "y": 179.2637650312795, "color": "FFCD38" }, { "x": 3.906411000324681, "y": 179.6661042639048, "color": "FFCD38" }, { "x": 4.3481192370545045, "y": 182.51412012932713, "color": "FFCD38" }, { "x": -4.145242673195554, "y": 183.6992909971559, "color": "FFCD38" }, { "x": 2.6289781551460294, "y": 184.67394333146316, "color": "FFCD38" }, { "x": 1.3799962729618755, "y": 191.8173564783348, "color": "FFCD38" }, { "x": -5.66104509772498, "y": 190.84841412806756, "color": "FFCD38" }, { "x": -1.501354219543515, "y": 188.58269003292918, "color": "FFCD38" }, { "x": -15.879281325204744, "y": 179.43764708151363, "color": "FFCD38" }, { "x": 14.94744429622375, "y": 178.91555791662665, "color": "FFCD38" }, { "x": 7.754994314582206, "y": 156.51892645820777, "color": "000000" }, { "x": 7.611655096182972, "y": 162.89181441930225, "color": "000000" }, { "x": -1.840374766173852, "y": 155.28354226952888, "color": "000000" }, { "x": -1.978178148529139, "y": 164.83477944784482, "color": "000000" }, { "x": -16.119424739364064, "y": 132.08958466552477, "color": "000000" }, { "x": -16.05562853965273, "y": 144.71229612270807, "color": "000000" }, { "x": -11.334394279574838, "y": 145.07431348052572, "color": "000000" }, { "x": -9.766483105013691, "y": 132.15204542844597, "color": "000000" }, { "x": 7.347591463148234, "y": 132.85205599442529, "color": "000000" }, { "x": 7.411387662859568, "y": 145.4747674516086, "color": "000000" }, { "x": 12.13262192293746, "y": 145.83678480942623, "color": "000000" }, { "x": 13.700533097498607, "y": 132.9145167573465, "color": "000000" }, { "x": -9.452612761816084, "y": 116.44523506058417, "color": "000000" }, { "x": -30.536873710627702, "y": 131.87463633096579, "color": "000000" }, { "x": -27.671055508789777, "y": 133.8277250993685, "color": "000000" }, { "x": -8.62920009233244, "y": 121.6331461629828, "color": "000000" }, { "x": 5.676764147583839, "y": 123.8658249536862, "color": "000000" }, { "x": 26.464689304983978, "y": 137.23759471954267, "color": "000000" }, { "x": 28.22209087806678, "y": 130.82945467875302, "color": "000000" }, { "x": 7.4656193354270215, "y": 117.09836435797385, "color": "000000" }, { "x": -250, "y": -250 }, { "x": -250, "y": 250 }, { "x": 250, "y": 250 }, { "x": 250, "y": -250 }
            ],
            "segments": [
                { "v0": 0, "v1": 1, "curve": -48.40892132431751 }, { "v0": 1, "v1": 2, "curve": 78.27328787932505 }, { "v0": 2, "v1": 3, "curve": 78.27328787932505 }, { "v0": 3, "v1": 0, "curve": 78.27328787932505 }, { "v0": 4, "v1": 5, "curve": -99.86832868112666 }, { "v0": 4, "v1": 5, "curve": -220.65426525977952 }, { "v0": 6, "v1": 7, "curve": 40.94455903948506 }, { "v0": 8, "v1": 9, "curve": -180 }, { "v0": 10, "v1": 11, "curve": -180 }, { "v0": 12, "v1": 13, "curve": 180.5883093505643 }, { "v0": 14, "v1": 15, "curve": 180.35960265299846 }, { "v0": 16, "v1": 17, "curve": -180.62328923596314 }, { "v0": 18, "v1": 19, "curve": -180.3809842792159 }, { "v0": 20, "v1": 21, "curve": -179.73182634170206 }, { "v0": 22, "v1": 23, "curve": -179.83608022133214 }, { "v0": 24, "v1": 25 }, { "v0": 26, "v1": 27, "curve": -180 }, { "v0": 28, "v1": 29, "curve": -180 }, { "v0": 30, "v1": 31, "curve": 180.5883093505643 }, { "v0": 32, "v1": 33, "curve": 180.35960265299846 }, { "v0": 34, "v1": 35, "curve": -180.62328923596314 }, { "v0": 36, "v1": 37, "curve": -180.3809842792159 }, { "v0": 38, "v1": 39, "curve": -179.73182634170206 }, { "v0": 40, "v1": 41, "curve": -179.83608022133214 }, { "v0": 42, "v1": 43 }, { "v0": 44, "v1": 45, "curve": 108.96495097754075 }, { "v0": 46, "v1": 47, "curve": -35.93064360646293 }, { "v0": 48, "v1": 49, "curve": -35.93064360646293, "color": "000000" }, { "v0": 50, "v1": 51, "curve": -35.93064360646293, "color": "000000" }, { "v0": 52, "v1": 53, "curve": -35.93064360646293, "color": "000000" }, { "v0": 54, "v1": 55, "curve": -35.93064360646293, "color": "000000" }, { "v0": 56, "v1": 57, "curve": 82.93385698516161, "color": "FF78C3" }, { "v0": 58, "v1": 59, "curve": 82.93385698516161, "color": "FF78C3" }, { "v0": 60, "v1": 61, "curve": 82.93385698516161, "color": "FF78C3" }, { "v0": 62, "v1": 63, "curve": 82.93385698516161, "color": "FF78C3" }, { "v0": 64, "v1": 65, "curve": 62.40102920796217, "color": "1F130C" }, { "v0": 66, "v1": 67, "curve": 30.736926643592472, "color": "1F130C" }, { "v0": 68, "v1": 69, "curve": 26.896922313710306, "color": "1F130C" }, { "v0": 70, "v1": 71, "curve": 53.46299027028869, "color": "1F130C" }, { "v0": 72, "v1": 73, "curve": -48.40892132431751 }, { "v0": 73, "v1": 74, "curve": 78.27328787932505 }, { "v0": 74, "v1": 75, "curve": 78.27328787932505 }, { "v0": 75, "v1": 72, "curve": 78.27328787932505 }, { "v0": 76, "v1": 77, "curve": 62.40102920796217, "color": "1F130C" }, { "v0": 78, "v1": 79, "curve": 30.736926643592472, "color": "1F130C" }, { "v0": 80, "v1": 81, "curve": 26.896922313710306, "color": "1F130C" }, { "v0": 82, "v1": 83, "curve": 53.46299027028869, "color": "1F130C" }, { "v0": 85, "v1": 86, "curve": -2.9661091549501126, "color": "FFCD38" }, { "v0": 85, "v1": 87, "curve": 169.9150978616599, "color": "FFCD38" }, { "v0": 87, "v1": 88, "color": "FFCD38" }, { "v0": 88, "v1": 89, "curve": 83.38798616681613, "color": "FFCD38" }, { "v0": 89, "v1": 90, "color": "FFCD38" }, { "v0": 90, "v1": 91, "curve": 166.2875536599308, "color": "FFCD38" }, { "v0": 91, "v1": 92, "color": "FFCD38" }, { "v0": 86, "v1": 92, "curve": -104.15511605939327, "color": "FFCD38" }, { "v0": 93, "v1": 94, "curve": 78.86733571461087, "color": "FFCD38" }, { "v0": 94, "v1": 95, "curve": 78.86733571461087, "color": "FFCD38" }, { "v0": 96, "v1": 97, "curve": 91.18131442929028, "color": "FFCD38" }, { "v0": 97, "v1": 98, "curve": 91.18131442929028, "color": "FFCD38" }, { "v0": 98, "v1": 99, "curve": 91.18131442929028, "color": "FFCD38" }, { "v0": 99, "v1": 100, "curve": 91.18131442929028, "color": "FFCD38" }, { "v0": 84, "v1": 101, "curve": -155.04793287872678, "color": "FFCD38" }, { "v0": 84, "v1": 102, "curve": 164.22555163007294, "color": "FFCD38" }, { "v0": 103, "v1": 104, "curve": 78.9051322828673, "color": "000000" }, { "v0": 103, "v1": 105, "curve": -53.942850193915625, "color": "000000" }, { "v0": 104, "v1": 106, "curve": 51.4012659873561, "color": "000000" }, { "v0": 107, "v1": 108, "curve": -45.36686065484586, "color": "000000" }, { "v0": 108, "v1": 109, "curve": -65.78666392621135, "color": "000000" }, { "v0": 109, "v1": 110, "curve": -44.74566393827841, "color": "000000" }, { "v0": 110, "v1": 107, "curve": -65.17662763078462, "color": "000000" }, { "v0": 111, "v1": 112, "curve": -45.36686065484586, "color": "000000" }, { "v0": 112, "v1": 113, "curve": -65.78666392621135, "color": "000000" }, { "v0": 113, "v1": 114, "curve": -44.74566393827841, "color": "000000" }, { "v0": 114, "v1": 111, "curve": -65.17662763078462, "color": "000000" }, { "v0": 115, "v1": 116, "curve": -50.42557267712101, "color": "000000" }, { "v0": 116, "v1": 117, "curve": -98.35129873487507, "color": "000000" }, { "v0": 117, "v1": 118, "curve": 44.79730421185611, "color": "000000" }, { "v0": 118, "v1": 115, "curve": -63.17588464616453, "color": "000000" }, { "v0": 119, "v1": 120, "curve": 33.13493361520055, "color": "000000" }, { "v0": 120, "v1": 121, "curve": -98.35129873487507, "color": "000000" }, { "v0": 121, "v1": 122, "curve": -57.350969616744855, "color": "000000" }, { "v0": 122, "v1": 119, "curve": -63.17588464616453, "color": "000000" }, { "v0": 123, "v1": 124 }, { "v0": 124, "v1": 125 }, { "v0": 125, "v1": 126 }, { "v0": 126, "v1": 123 }
            ],
            "discs": [
                { "radius": 30, "invMass": 0, "pos": [0, -130], "color": "transparent", "cMask": ["ball"], "cGroup": ["c0"] },
                { "radius": 30, "invMass": 0, "pos": [124, -40], "color": "transparent", "cMask": ["ball"], "cGroup": ["c0"] },
                { "radius": 30, "invMass": 0, "pos": [76, 105], "color": "transparent", "cMask": ["ball"], "cGroup": ["c0"] },
                { "radius": 30, "invMass": 0, "pos": [-76, 105], "color": "transparent", "cMask": ["ball"], "cGroup": ["c0"] },
                { "radius": 30, "invMass": 0, "pos": [-124, -40], "color": "transparent", "cMask": ["ball"], "cGroup": ["c0"] },
                { "radius": 35, "invMass": 0, "pos": [0, 0], "color": "2D3748", "cMask": ["all"], "cGroup": ["wall"] },
                { "radius": 3, "invMass": 0, "pos": [-136.96133797090056, -170.57378513790945] },
                { "radius": 3, "invMass": 0, "pos": [-177.70520960797933, -157.70729935777922] }
            ],
            "planes": [
                { "normal": [0, 1], "dist": -400, "cMask": ["all"] },
                { "normal": [0, -1], "dist": -400, "cMask": ["all"] },
                { "normal": [1, 0], "dist": -400, "cMask": ["all"] },
                { "normal": [-1, 0], "dist": -400, "cMask": ["all"] }
            ],
            "goals": [],
            "spawns": [{ "x": 0, "y": 0, "team": "red" }],
            "balls": [{ "pos": [0, 0], "color": "FFFFFF" }],
            "traits": {}
        });
        await this.page.evaluate((s) => window.__haxRoom?.setCustomStadium(s), stadiumJson);
    } catch (error) {
        logger_1.roomLogger.error('Error cargando stadium:', error);
    }
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
                    if (e.type === 'playerKicked') this.handlers.onPlayerKicked?.(e.target, e.reason, e.ban, e.admin);
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
