/****************************************************
 * 設定
 ****************************************************/
//import { ENV } from "./env.js";

/****************************************************
 * ★ デバッグ用：localStorage 強制リセット
 ****************************************************/
if (location.search.includes("reset=1")) {
  console.warn("Reset flag detected. Clearing localStorage...");
  localStorage.clear();
  alert("localStorage cleared");
}

const ENV = window.ENV || {};
const LIFF_ID = ENV.LIFF_ID;
const API_URL = ENV.API_URL;

// ★ 認証後に保存する authcode
let AUTH_CODE = null;


/****************************************************
 * localStorage から AUTH_CODE を復元
 ****************************************************/
function restoreAuthCode() {
    const saved = localStorage.getItem("AUTH_CODE");
    if (saved) {
        AUTH_CODE = saved;
        console.log("RESTORED AUTH_CODE:", AUTH_CODE);
    }
}

/****************************************************
 * LIFF 初期化
 ****************************************************/
async function initLIFF() {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
        liff.login();
        return null;
    }

    return await liff.getProfile();
}


/****************************************************
 * LogicApps API 呼び出し
 ****************************************************/
async function callApi(body) {
    console.log("API Request:", body);

    let res;
    try {
        res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error("API fetch error:", e);
        return { error: "network_error" };
    }

    try {
        return await res.json();
    } catch (e) {
        console.error("API parse error:", e);
        return { error: "json_error" };
    }
}


/****************************************************
 * index.html ロジック
 ****************************************************/
async function initIndexPage() {
    const loading = document.getElementById("loading");
    const menu = document.getElementById("menu");
    const guardianNameLabel = document.getElementById("guardianName");

    restoreAuthCode();  // ★ AUTH_CODE 復元

    const profile = await initLIFF();
    if (!profile) {
        loading.innerHTML = "<p>ログイン中です…</p>";
        return;
    }

    const lineId = profile.userId;
    localStorage.setItem("LINE_ID", lineId);

    let result = null;

    // ★ AUTH_CODE がないときだけ check_guardian
    if (!AUTH_CODE) {
        result = await callApi({
            action: "check_guardian",
            lineId: lineId
        });

        if (result?.error) {
            loading.innerHTML = "<p>通信エラーが発生しました。</p>";
            return;
        }

        if (!result?.exists) {
            window.location.href = "register_guardian.html";
            return;
        }

        AUTH_CODE = result.authCode;
        localStorage.setItem("AUTH_CODE", AUTH_CODE);
        localStorage.setItem("GUARDIAN_NAME", result.guardianName);
        guardianNameLabel.textContent = `${result.guardianName} さん`;
    } else {
        // ★ 既ログイン（通信しない）
        const name = localStorage.getItem("GUARDIAN_NAME");
        if (name) guardianNameLabel.textContent = `${name} さん`;
    }

    loading.style.display = "none";
    menu.style.display = "block";

    loadUpcomingContacts();
}


/****************************************************
 * 本日以降の連絡一覧を取得して表示（JSTで送信）
 ****************************************************/
async function loadUpcomingContacts() {
    if (!AUTH_CODE) return;

    // 今日の日付を生成
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;  // 例: 2025-12-11

    console.log("dateFrom:", today);

    const res = await callApi({
        action: "get_contacts",
        authCode: AUTH_CODE,
        dateFrom: today
    });

    const ul = document.getElementById("contactList");
    ul.innerHTML = "";

    if (!res.items || res.items.length === 0) {
        ul.innerHTML = "<li>本日以降の連絡はありません</li>";
        return;
    }

    res.items.forEach(c => {
      const li = document.createElement("li");
      li.className = "contact-item";
    
      const a = document.createElement("a");
      a.className = "contact-row";
      a.href = `contact_form.html?mode=edit&contactId=${encodeURIComponent(c.contactId)}&type=${encodeURIComponent(c.type)}`;
    
      const text = document.createElement("span");
      text.className = "contact-text";
      text.textContent = `${c.date} ${c.name ?? ""}`;
    
      const type = document.createElement("span");
      type.className = "contact-type";
      type.textContent = c.type;
    
      a.append(text, type);
      li.appendChild(a);
      ul.appendChild(li);
    });

}


/****************************************************
 * register_guardian.html ロジック
 ****************************************************/
async function initRegisterPage() {
    const profile = await initLIFF();
    if (!profile) return;

    const lineId = profile.userId;
    const msg = document.getElementById("msg");

    document.getElementById("btnRegister").onclick = async () => {
        const authCode = document.getElementById("authCode").value;
        const email = document.getElementById("email").value;

        if (!authCode || !email) {
            msg.textContent = "未入力の項目があります。";
            return;
        }

        const res = await callApi({
            action: "register_guardian_by_code",
            lineId: lineId,
            authCode: authCode,
            email: email
        });

        if (res.result === "success") {
            msg.textContent = "登録が完了しました。";
            setTimeout(() => (window.location.href = "index.html"), 700);
        } else {
            msg.textContent = "登録に失敗しました。" + (res.message ?? "");
        }
    };
}

/****************************************************
 * contact_list.html：連絡履歴一覧を取得して表示
 *
 * dateFrom ロジック（ローカル日付基準）:
 *   当日が 4/30 以前（月<=4）→ 前年の 4/1
 *   当日が 5/1  以降（月>=5）→ 本年の 4/1
 ****************************************************/
async function initContactListPage() {

    const loading = document.getElementById("loading");
    const historyBox = document.getElementById("historyBox");
    const ul = document.getElementById("historyList");

    await initLIFF();

    restoreAuthCode();  // ★ ここでも復元する

    if (!AUTH_CODE) {
        loading.innerHTML = "<p>認証情報がありません。</p>";
        return;
    }

    // ローカル日付で月を判定
    const now = new Date();
    const localMonth = now.getMonth() + 1; // 1〜12
    const localYear  = now.getFullYear();

    // 4月以前（1〜4月）は前年度の4/1、5月以降は本年の4/1
    const fromYear = localMonth <= 4 ? localYear - 1 : localYear;
    const dateFrom = `${fromYear}-04-01`;

    console.log("contact_list dateFrom:", dateFrom);

    const res = await callApi({
        action: "get_contacts",
        authCode: AUTH_CODE,
        dateFrom: dateFrom
    });

    loading.style.display = "none";
    historyBox.style.display = "block";

    ul.innerHTML = "";

    if (!res.items || res.items.length === 0) {
        ul.innerHTML = "<li>連絡履歴はありません</li>";
        return;
    }

    res.items.forEach(c => {
        const li = document.createElement("li");
        li.textContent = `${c.date} ${c.name ?? ""}   ${c.type}`;
        ul.appendChild(li);
    });
}

/****************************************************
 * contact_form.html（統一フォーム）から利用するAPIラッパ
 ****************************************************/
async function apiGetKids() {
    return await callApi({
        action: "get_kids",
        authCode: AUTH_CODE
    });
}

async function apiGetCalendar(params) {
    return await callApi({
        action: "get_calendar",
        authCode: AUTH_CODE,
        ...params
    });
}

async function apiSubmitContact(payload) {
    payload.action = "submit_contact";
    payload.authCode = AUTH_CODE;
    return await callApi(payload);
}


/****************************************************
 * ページ判定 & 初期化実行
 ****************************************************/
document.addEventListener("DOMContentLoaded", async () => {

    const path = location.pathname;

    try {
        if (path.endsWith("index.html") || path.endsWith("/")) {
            // しっかり await して完了を待つ
            await initIndexPage();
        }
        else if (path.endsWith("register_guardian.html")) {
            await initRegisterPage();
        }
        else if (path.endsWith("contact_list.html")) {
            await initContactListPage();
        }
    } catch (err) {
        console.error("Initialization failed:", err);
        // エラーが見えるように loading 領域に表示
        const loading = document.getElementById("loading");
        if (loading) {
            loading.innerHTML = `<p>初期化エラーが発生しました。<br>${err.message}</p>`;
        }
    }
});

// ===== 他JS（contact_form.js 等）から使うために公開 =====
window.restoreAuthCode = restoreAuthCode;
window.callApi = callApi;
window.apiGetKids = apiGetKids;
window.apiGetCalendar = apiGetCalendar;
window.apiSubmitContact = apiSubmitContact;

// AUTH_CODE は参照・更新されるので getter/setter で公開
Object.defineProperty(window, "AUTH_CODE", {
  get() {
    return AUTH_CODE;
  },
  set(v) {
    AUTH_CODE = v;
  }
});