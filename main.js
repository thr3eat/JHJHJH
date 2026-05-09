const express = require('express');
const app = express();
app.use(express.json());

// ============================================================
//  YAPILANDIRMA
// ============================================================
const ROBLOX_COOKIE  = (process.env.ROBLOX_COOKIE || '').trim();
const API_SECRET     = process.env.API_SECRET || 'gizli-anahtar'; // Render'da env variable olarak ekle
const PORT           = process.env.PORT || 3000;

// Rütbe listesi (Grup ID: 8505535)
const rankList = [
    { name: "Polis",                              id: 1   },
    { name: "Akademi Adayı",                      id: 2   },
    { name: "Akademi",                            id: 3   },
    { name: "Polis Memuru Adayı",                 id: 6   },
    { name: "Polis Memuru",                       id: 7   },
    { name: "Kıdemli Polis Memuru",               id: 8   },
    { name: "Başpolis Memuru Adayı",              id: 9   },
    { name: "Başpolis Memuru",                    id: 10  },
    { name: "Kıdemli Başpolis Memuru",            id: 11  },
    { name: "Uzm. Başpolis Memuru",               id: 12  },
    { name: "Aday Komiser",                       id: 13  },
    { name: "Emekli Personel",                    id: 14  },
    { name: "Stajyer Komiser",                    id: 15  },
    { name: "Komiser Yardımcısı",                 id: 16  },
    { name: "Askomiser",                          id: 17  },
    { name: "Komiser",                            id: 18  },
    { name: "Üskomiser",                          id: 19  },
    { name: "Başkomiser",                         id: 20  },
    { name: "Amir Adayı",                         id: 21  },
    { name: "Emniyet Amiri",                      id: 22  },
    { name: "Müdür",                              id: 23  },
    { name: "4. Sınıf Emniyet Müdürü",            id: 24  },
    { name: "3. Sınıf Emniyet Müdürü",            id: 25  },
    { name: "2. Sınıf Emniyet Müdürü",            id: 26  },
    { name: "1. Sınıf Emniyet Müdürü",            id: 27  },
    { name: "Emniyet Genel Müdürü",               id: 28  },
    { name: "Teftiş Kurulu",                      id: 29  },
    { name: "Teftiş Kurulu Başkan Yardımcısı",    id: 30  },
    { name: "Teftiş Kurulu Başkanı",              id: 31  },
    { name: "Yüksek Polis Kurulu",                id: 32  },
    { name: "Yönetim Kurulu",                     id: 33  },
    { name: "Yönetim Kurulu Başkan Yardımcısı",   id: 34  },
    { name: "Yönetim Kurulu Başkanı",             id: 36  },
    { name: "Contributor",                        id: 37  },
    { name: "Geliştirme Ekibi",                   id: 250 },
    { name: "Başkan",                             id: 252 },
    { name: "Cumhurbaşkanı",                      id: 254 },
    { name: "Proje Uygulaması",                   id: 255 }
];

const ROBLOX_GROUP_ID = 8505535;

// ============================================================
//  ROBLOX YARDIMCI FONKSİYONLAR
// ============================================================

// Grup rollerini cache'le
let groupRolesCache = null;

async function getGroupRoles() {
    if (groupRolesCache) return groupRolesCache;
    const res = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/roles`, {
        headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
    });
    if (!res.ok) throw new Error(`Grup rolleri alınamadı: ${res.status}`);
    const data = await res.json();
    groupRolesCache = data.roles || [];
    console.log(`[✅] ${groupRolesCache.length} grup rolü yüklendi.`);
    return groupRolesCache;
}

async function getRoleIdByRank(rankNumber) {
    const roles = await getGroupRoles();
    const role = roles.find(r => r.rank === rankNumber);
    return role ? role.id : null;
}

async function getCsrfToken() {
    const res = await fetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        headers: {
            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
            'Content-Length': '0'
        }
    });
    const token = res.headers.get('x-csrf-token');
    if (!token) throw new Error('CSRF token alınamadı');
    return token;
}

async function getRobloxUserByUsername(username) {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });
    const data = await res.json();
    return data?.data?.[0] || null;
}

async function getUserRankInGroup(robloxUserId) {
    const res = await fetch(`https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`);
    const data = await res.json();
    if (data?.data) {
        const group = data.data.find(g => g.group.id === ROBLOX_GROUP_ID);
        if (group) return { rank: group.role.rank, name: group.role.name };
    }
    return { rank: 0, name: 'Grup Üyesi Değil' };
}

async function setRobloxRank(robloxUserId, rankNumber) {
    const roleId = await getRoleIdByRank(rankNumber);
    if (!roleId) throw new Error(`Rank ${rankNumber} için roleId bulunamadı.`);

    const csrfToken = await getCsrfToken();

    const res = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/users/${robloxUserId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
            'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ roleId })
    });

    if (!res.ok) {
        const err = await res.text().catch(() => 'Bilinmeyen hata');
        throw new Error(`Roblox API: ${res.status} — ${err}`);
    }
    return true;
}

// ============================================================
//  YETKİ MIDDLEWARE
// ============================================================
function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_SECRET) {
        return res.status(401).json({ success: false, error: 'Yetkisiz erişim. Geçersiz API anahtarı.' });
    }
    next();
}

// ============================================================
//  ROTALAR
// ============================================================

// GET / — Durum kontrolü (herkese açık)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Roblox Rütbe API — Çalışıyor ✅',
        group_id: ROBLOX_GROUP_ID,
        total_ranks: rankList.length,
        endpoints: [
            'GET  /ranks                — Tüm rütbe listesi',
            'GET  /rank/:username       — Kullanıcının mevcut rütbesi (x-api-key gerekli)',
            'POST /rank/set             — Rütbe ata (x-api-key gerekli)',
            'POST /rank/promote         — Terfi ettir (x-api-key gerekli)',
            'POST /rank/demote          — Tenzil et (x-api-key gerekli)',
        ]
    });
});

// GET /ranks — Tüm rütbe listesi (herkese açık)
app.get('/ranks', (req, res) => {
    res.json({ success: true, ranks: rankList });
});

// GET /rank/:username — Kullanıcının mevcut rütbesini getir
app.get('/rank/:username', authMiddleware, async (req, res) => {
    try {
        const { username } = req.params;

        const robloxUser = await getRobloxUserByUsername(username);
        if (!robloxUser) {
            return res.status(404).json({ success: false, error: `"${username}" adında Roblox kullanıcısı bulunamadı.` });
        }

        const rankData = await getUserRankInGroup(robloxUser.id);
        const rankObj  = rankList.find(r => r.id === rankData.rank) || null;
        const rankIndex = rankList.findIndex(r => r.id === rankData.rank);
        const nextRank  = rankIndex !== -1 && rankIndex < rankList.length - 1 ? rankList[rankIndex + 1] : null;

        res.json({
            success: true,
            user: {
                id:       robloxUser.id,
                username: robloxUser.name,
            },
            current_rank: {
                id:    rankData.rank,
                name:  rankObj?.name || rankData.name,
                index: rankIndex,
            },
            next_rank: nextRank || null,
            in_group: rankData.rank !== 0,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /rank/set — Belirli bir rütbe ata
// Body: { "username": "KullaniciAdi", "rank_id": 10 }
app.post('/rank/set', authMiddleware, async (req, res) => {
    try {
        const { username, rank_id } = req.body;

        if (!username || rank_id === undefined) {
            return res.status(400).json({ success: false, error: '"username" ve "rank_id" zorunludur.' });
        }

        const targetRank = rankList.find(r => r.id === Number(rank_id));
        if (!targetRank) {
            return res.status(400).json({ success: false, error: `Geçersiz rank_id: ${rank_id}. /ranks ile geçerli listeye bakın.` });
        }

        const robloxUser = await getRobloxUserByUsername(username);
        if (!robloxUser) {
            return res.status(404).json({ success: false, error: `"${username}" adında Roblox kullanıcısı bulunamadı.` });
        }

        const oldRankData = await getUserRankInGroup(robloxUser.id);
        if (oldRankData.rank === 0) {
            return res.status(400).json({ success: false, error: `"${robloxUser.name}" bu grupta üye değil.` });
        }

        await setRobloxRank(robloxUser.id, targetRank.id);

        const oldRankObj = rankList.find(r => r.id === oldRankData.rank);

        res.json({
            success: true,
            message: `Rütbe başarıyla atandı.`,
            user: { id: robloxUser.id, username: robloxUser.name },
            old_rank: { id: oldRankData.rank, name: oldRankObj?.name || oldRankData.name },
            new_rank: { id: targetRank.id, name: targetRank.name },
        });

        console.log(`[RANK SET] ${robloxUser.name} → Rank ${targetRank.id} (${targetRank.name})`);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /rank/promote — Bir üst rütbeye terfi
// Body: { "username": "KullaniciAdi" }
app.post('/rank/promote', authMiddleware, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, error: '"username" zorunludur.' });

        const robloxUser = await getRobloxUserByUsername(username);
        if (!robloxUser) {
            return res.status(404).json({ success: false, error: `"${username}" adında Roblox kullanıcısı bulunamadı.` });
        }

        const currentRank = await getUserRankInGroup(robloxUser.id);
        if (currentRank.rank === 0) {
            return res.status(400).json({ success: false, error: `"${robloxUser.name}" bu grupta üye değil.` });
        }

        const currentIndex = rankList.findIndex(r => r.id === currentRank.rank);
        if (currentIndex === -1 || currentIndex >= rankList.length - 1) {
            return res.status(400).json({ success: false, error: 'Kullanıcı zaten en yüksek rütbede veya rütbesi tanımlı değil.' });
        }

        const newRank = rankList[currentIndex + 1];
        await setRobloxRank(robloxUser.id, newRank.id);

        const oldRankObj = rankList[currentIndex];

        res.json({
            success: true,
            message: 'Terfi başarılı.',
            user: { id: robloxUser.id, username: robloxUser.name },
            old_rank: { id: oldRankObj.id, name: oldRankObj.name },
            new_rank: { id: newRank.id, name: newRank.name },
        });

        console.log(`[PROMOTE] ${robloxUser.name} → ${oldRankObj.name} → ${newRank.name}`);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /rank/demote — Bir alt rütbeye tenzil
// Body: { "username": "KullaniciAdi" }
app.post('/rank/demote', authMiddleware, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, error: '"username" zorunludur.' });

        const robloxUser = await getRobloxUserByUsername(username);
        if (!robloxUser) {
            return res.status(404).json({ success: false, error: `"${username}" adında Roblox kullanıcısı bulunamadı.` });
        }

        const currentRank = await getUserRankInGroup(robloxUser.id);
        if (currentRank.rank === 0) {
            return res.status(400).json({ success: false, error: `"${robloxUser.name}" bu grupta üye değil.` });
        }

        const currentIndex = rankList.findIndex(r => r.id === currentRank.rank);
        if (currentIndex <= 0) {
            return res.status(400).json({ success: false, error: 'Kullanıcı zaten en düşük rütbede.' });
        }

        const newRank = rankList[currentIndex - 1];
        await setRobloxRank(robloxUser.id, newRank.id);

        const oldRankObj = rankList[currentIndex];

        res.json({
            success: true,
            message: 'Tenzil başarılı.',
            user: { id: robloxUser.id, username: robloxUser.name },
            old_rank: { id: oldRankObj.id, name: oldRankObj.name },
            new_rank: { id: newRank.id, name: newRank.name },
        });

        console.log(`[DEMOTE] ${robloxUser.name} → ${oldRankObj.name} → ${newRank.name}`);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
//  SUNUCUYU BAŞLAT
// ============================================================
if (!ROBLOX_COOKIE || ROBLOX_COOKIE.length < 50) {
    console.warn('[⚠️] ROBLOX_COOKIE eksik veya çok kısa! Render Environment Variables\'a ekleyin.');
}

// Grup rollerini başlangıçta önbelleğe al
getGroupRoles().then(() => {
    console.log('[✅] Grup rolleri önbelleğe alındı.');
}).catch(err => {
    console.error('[❌] Grup rolleri alınamadı:', err.message);
});

app.listen(PORT, () => {
    console.log(`[🚀] Roblox Rütbe API çalışıyor → http://localhost:${PORT}`);
});
