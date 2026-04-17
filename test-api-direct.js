/**
 * Direct ESET API test — bypasses MCP entirely
 * Tests EDR rule exclusion creation step by step
 */
const https = require("https");

const CREDENTIALS = {
  username: "aiappitsec@aiapremier.co.kr",
  password: "&X#xYrVD%4bK2Bs",
};

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString("utf-8");
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    username: CREDENTIALS.username,
    password: CREDENTIALS.password,
  }).toString();

  console.log("=== Step 1: Authentication ===");
  console.log(`POST https://eu.business-account.iam.eset.systems/oauth/token`);
  console.log(`Body length: ${body.length}`);

  const res = await httpsRequest({
    method: "POST",
    hostname: "eu.business-account.iam.eset.systems",
    path: "/oauth/token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  console.log(`Status: ${res.status}`);
  if (res.status !== 200) {
    console.log(`Response: ${res.body}`);
    throw new Error("Auth failed");
  }
  const token = JSON.parse(res.body).access_token;
  console.log(`Token: ${token.substring(0, 30)}...`);
  console.log(`Expires in: ${JSON.parse(res.body).expires_in}s`);
  return token;
}

async function testListExclusions(token) {
  console.log("\n=== Step 2: List existing exclusions (sanity check) ===");
  console.log(`GET https://eu.incident-management.eset.systems/v2/edr-rule-exclusions?pageSize=2`);

  const res = await httpsRequest({
    method: "GET",
    hostname: "eu.incident-management.eset.systems",
    path: "/v2/edr-rule-exclusions?pageSize=2",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  console.log(`Status: ${res.status}`);
  console.log(`Server: ${res.headers["server"] || "N/A"}`);
  if (res.status === 200) {
    const data = JSON.parse(res.body);
    console.log(`Exclusions count: ${(data.exclusions || []).length}`);
    if (data.exclusions && data.exclusions[0]) {
      console.log(`First exclusion UUID: ${data.exclusions[0].uuid}`);
      console.log(`First exclusion displayName: ${data.exclusions[0].displayName}`);
    }
  } else {
    console.log(`Response body: ${res.body.substring(0, 500)}`);
  }
  return res;
}

async function testCreateExclusion(token, testName, payload) {
  console.log(`\n=== ${testName} ===`);
  const bodyStr = JSON.stringify(payload);
  console.log(`POST https://eu.incident-management.eset.systems/v2/edr-rule-exclusions`);
  console.log(`Body length: ${bodyStr.length}`);
  console.log(`Body: ${bodyStr.substring(0, 300)}...`);

  const res = await httpsRequest({
    method: "POST",
    hostname: "eu.incident-management.eset.systems",
    path: "/v2/edr-rule-exclusions",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Content-Length": Buffer.byteLength(bodyStr),
    },
  }, bodyStr);

  console.log(`Status: ${res.status}`);
  console.log(`Server: ${res.headers["server"] || "N/A"}`);
  console.log(`Response headers: ${JSON.stringify({
    "content-type": res.headers["content-type"],
    "x-request-id": res.headers["x-request-id"],
    "request-id": res.headers["request-id"],
  })}`);
  console.log(`Response body: "${res.body}"`);
  return res;
}

async function main() {
  try {
    const token = await getToken();
    
    // Sanity check: list exclusions
    await testListExclusions(token);

    // Test A: Absolute minimum — just enabled, no XML, no rules
    await testCreateExclusion(token, "Test A: Minimum (enabled only, no XML)", {
      exclusion: {
        enabled: false,
      }
    });

    // Test B: With a trivial XML
    await testCreateExclusion(token, "Test B: enabled + simple XML", {
      exclusion: {
        enabled: false,
        xmlDefinition: '<rule><description><name>API Test B</name><category>Exclusion</category></description><definition><process><operator type="OR"><condition component="FileItem" property="FileName" condition="is" value="test.exe" /></operator></process></definition></rule>'
      }
    });

    // Test C: Without exclusion wrapper
    await testCreateExclusion(token, "Test C: NO exclusion wrapper (flat)", {
      enabled: false,
      xmlDefinition: '<rule><description><name>API Test C</name><category>Exclusion</category></description><definition><process><operator type="OR"><condition component="FileItem" property="FileName" condition="is" value="test.exe" /></operator></process></definition></rule>'
    });

    // Test D: With ruleUuids
    await testCreateExclusion(token, "Test D: enabled + XML + ruleUuids", {
      exclusion: {
        enabled: false,
        ruleUuids: ["5d6b3886-4f31-41f6-add7-f9720e2c6eda"],
        xmlDefinition: '<rule><description><name>API Test D</name><category>Exclusion</category></description><definition><process><operator type="OR"><condition component="FileItem" property="FileName" condition="is" value="test.exe" /></operator></process></definition></rule>'
      }
    });

    // Test E: With scopes
    await testCreateExclusion(token, "Test E: enabled + XML + scopes", {
      exclusion: {
        enabled: false,
        scopes: [{ deviceGroupUuid: "00000000-0000-0000-7001-000000000001" }],
        xmlDefinition: '<rule><description><name>API Test E</name><category>Exclusion</category></description><definition><process><operator type="OR"><condition component="FileItem" property="FileName" condition="is" value="test.exe" /></operator></process></definition></rule>'
      }
    });

    // Test F: The full user payload 
    await testCreateExclusion(token, "Test F: Full user payload (complex XML)", {
      exclusion: {
        enabled: true,
        note: "Korea Financial Security test",
        ruleUuids: ["5d6b3886-4f31-41f6-add7-f9720e2c6eda"],
        scopes: [{ deviceGroupUuid: "00000000-0000-0000-7001-000000000001" }],
        xmlDefinition: '<?xml version="1.0" encoding="utf-8"?><rule>\n\t<description>\n\t\t<name>Korea Financial Security Programs Test</name>\n\t\t<category>Exclusion</category>\n\t</description>\n\t<definition>\n\t\t<process>\n\t\t\t<operator type="OR">\n\t\t\t\t<condition component="FileItem" property="FileName" condition="is" value="veraport.exe" />\n\t\t\t\t<condition component="FileItem" property="FileName" condition="is" value="wpmsvc.exe" />\n\t\t\t</operator>\n\t\t</process>\n\t</definition>\n</rule>'
      }
    });

  } catch (err) {
    console.error("Fatal error:", err.message || err);
  }
}

main();
