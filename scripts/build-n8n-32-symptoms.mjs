/**
 * สร้าง n8n_workflow_32_symptoms.json ให้ครบโหนด + Web Search
 * รัน: node scripts/build-n8n-32-symptoms.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prompt = readFileSync(join(root, 'n8n_system_prompt.txt'), 'utf-8').trimEnd();

const PREPROCESS_JS = `const input = $input.first().json;
const chatInput = String(input.chatInput || input.message || '');
const sessionId = input.sessionId || 'default';

const profileMatch = chatInput.match(/\\[PROFILE\\]([^\\[]+)/);
const profileStr = profileMatch ? profileMatch[1] : '';
const getField = (label) => {
  const re = new RegExp(label + '\\\\s*:\\\\s*([^|\\\\n]+?)(?=\\\\s*\\\\||\\\\n|$)', 'i');
  const m = profileStr.match(re);
  return m ? m[1].trim() : '';
};

const userName = getField('ชื่อ') || 'User';
const userGenderRaw = getField('เพศ').toLowerCase();
const userGender = /ชาย|male|^m$/.test(userGenderRaw) ? 'male'
  : /หญิง|female|^f$/.test(userGenderRaw) ? 'female' : 'unknown';

const femaleKeywords = ['ประจำเดือน', 'ปวดประจำเดือน', 'มีประจำเดือน', 'menstrual', 'period', 'ตกขาว', 'ช่องคลอด', 'ครรภ์', 'pregnant'];
const maleKeywords = ['ต่อมลูกหมาก', 'ลูกอัณฑะ', 'อัณฑะ', 'prostate', 'testic'];
const lower = chatInput.toLowerCase();
const genderMismatchF = femaleKeywords.some((kw) => lower.includes(kw.toLowerCase())) && userGender === 'male';
const genderMismatchM = maleKeywords.some((kw) => lower.includes(kw.toLowerCase())) && userGender === 'female';

const hints = [];
if (genderMismatchF) {
  hints.push('[SYSTEM_HINT] โปรไฟล์เป็นเพศชาย แต่ข้อความเกี่ยวกับอาการเพศหญิง — ถามเพื่อยืนยัน หรือตอบอย่างระมัดระวัง');
}
if (genderMismatchM) {
  hints.push('[SYSTEM_HINT] โปรไฟล์เป็นเพศหญิง แต่ข้อความเกี่ยวกับอาการเพศชาย — ถามเพื่อยืนยัน หรือตอบอย่างระมัดระวัง');
}

const stateMatch = chatInput.match(/\\[CHAT_STATE\\][^\\n]*ข้อ\\s*(\\d+)/i)
  || chatInput.match(/\\[CHAT_STATE\\][^\\n]*question\\s*(\\d+)/i);
if (stateMatch) {
  const nextQ = Number(stateMatch[1]);
  hints.push('[SYSTEM_HINT] สถานะจากระบบ: ถามข้อถัดไปเป็นข้อ ' + nextQ + ' เท่านั้น ห้ามย้อนถามข้อก่อนหน้า');
} else {
  const hdrRe = /🩺\\s*ข้อ\\s*(\\d+)\\s*[:：]/g;
  const asked = [];
  let hm;
  while ((hm = hdrRe.exec(chatInput)) !== null) asked.push(Number(hm[1]));
  if (asked.length > 0) {
    const max = Math.max(...asked);
    hints.push('[SYSTEM_HINT] ในประวัติถามถึงข้อ ' + max + ' แล้ว — ถ้าตอบตรงประเด็นให้ถามข้อ ' + (max + 1) + ' หรือสรุปถ้าครบ 5');
  }
}

if (!chatInput.includes('[CHAT_HISTORY]')) {
  hints.push('[SYSTEM_HINT] ใช้ memory + ข้อความนี้เท่านั้นในการตัดสินลำดับข้อถัดไป');
}

return [{
  json: {
    chatInput: chatInput + (hints.length ? '\\n\\n' + hints.join('\\n') : ''),
    sessionId,
    userName,
    userGender,
  },
}];`;

const AGENT_NAME = 'AI Agent — ผู้ช่วยซักประวัติ';

const workflow = {
  name: 'TELEBOT-PHARMACY — 32 อาการ + Web Search',
  active: true,
  nodes: [
    {
      parameters: {
        public: true,
        mode: 'webhook',
        options: { responseMode: 'lastNode' },
      },
      id: '8f3d01cf-2a34-49e2-b253-754327cad9a3',
      name: 'Chat Trigger',
      type: '@n8n/n8n-nodes-langchain.chatTrigger',
      typeVersion: 1.1,
      position: [-520, 280],
      webhookId: '1f5ea30f-2ff0-4d32-b211-eccb342ee0df',
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: PREPROCESS_JS,
      },
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Preprocess',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-300, 280],
    },
    {
      parameters: {
        promptType: 'define',
        text: '={{ $json.chatInput }}',
        options: {
          systemMessage: prompt,
        },
      },
      id: '9fd2a97b-6583-442a-81b1-851d5d88caf1',
      name: AGENT_NAME,
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 1.7,
      position: [-40, 280],
    },
    {
      parameters: {
        model: 'gemma4:latest',
        options: {
          temperature: 0.2,
          topP: 0.9,
          numCtx: 4096,
        },
      },
      id: 'c7b8a1aa-2471-4e39-8dd3-b73a2a2fa498',
      name: 'Ollama Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOllama',
      typeVersion: 1,
      position: [-120, 520],
      credentials: {
        ollamaApi: {
          id: 'telebot-ollama-local',
          name: 'Ollama local',
        },
      },
    },
    {
      parameters: {
        contextWindowLength: 20,
      },
      id: 'e4bacd8f-a33b-4e7c-9bf1-036a4adcd7c7',
      name: 'Window Buffer Memory',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.3,
      position: [80, 520],
    },
    {
      parameters: {},
      id: 'wiki-tool-001-aaaa-bbbb-cccc-ddddeeeeffff',
      name: 'Wikipedia',
      type: '@n8n/n8n-nodes-langchain.toolWikipedia',
      typeVersion: 1,
      position: [280, 420],
    },
    {
      parameters: {
        toolDescription:
          'ค้นหาข้อมูลสุขภาพทั่วไปจากเว็บ (DuckDuckGo Instant Answer). ใช้ตอนสรุป/คำแนะนำเบื้องต้น เมื่อต้องการอ้างอิงสั้นๆ เกี่ยวกับอาการที่ล็อกเท่านั้น — ห้ามค้นเรื่องนอกสุขภาพ 32 อาการ และห้ามใช้ระหว่างถามข้อ 1-5 ถ้ายังไม่ครบ',
        method: 'GET',
        url: 'https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1',
        authentication: 'none',
        sendQuery: false,
        sendHeaders: false,
        sendBody: false,
        placeholderDefinitions: {
          values: [
            {
              name: 'query',
              description: 'คำค้นภาษาไทยหรืออังกฤษ สั้นๆ เช่น ปวดศีรษะ ดูแลเบื้องต้น',
              type: 'string',
            },
          ],
        },
        optimizeResponse: true,
        responseType: 'json',
        fieldsToInclude: 'selected',
        fields: 'Abstract,AbstractText,Answer,Heading,RelatedTopics',
      },
      id: 'web-search-ddg-001-aaaa-bbbb-cccc-ddddeeee0001',
      name: 'Web Search',
      type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
      typeVersion: 1.1,
      position: [280, 560],
    },
  ],
  connections: {
    'Chat Trigger': {
      main: [[{ node: 'Preprocess', type: 'main', index: 0 }]],
    },
    Preprocess: {
      main: [[{ node: AGENT_NAME, type: 'main', index: 0 }]],
    },
    'Ollama Chat Model': {
      ai_languageModel: [[{ node: AGENT_NAME, type: 'ai_languageModel', index: 0 }]],
    },
    'Window Buffer Memory': {
      ai_memory: [[{ node: AGENT_NAME, type: 'ai_memory', index: 0 }]],
    },
    Wikipedia: {
      ai_tool: [[{ node: AGENT_NAME, type: 'ai_tool', index: 0 }]],
    },
    'Web Search': {
      ai_tool: [[{ node: AGENT_NAME, type: 'ai_tool', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  pinData: {},
  meta: {
    templateCredsSetupCompleted: true,
  },
};

const outPath = join(root, 'n8n_workflow_32_symptoms.json');
writeFileSync(outPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf-8');
console.log('Wrote', outPath);
console.log('Nodes:', workflow.nodes.map((n) => n.name).join(' → '));
