# זרימת עבודה: מרגע השליחה ועד קבלת התוצר

המסמך הזה מתאר את הזרימה בפועל בקוד, מהרגע שהמשתמש שולח בקשה ליצירת מסמך ועד שהתוצר חוזר לעורך.

## 1) הטריגר מה-UI (שליחה מה-StartScreen)

מקור: `src/main.jsx` (באזור `onGenerateFromPrompt`)

```jsx
onGenerateFromPrompt={async ({ prompt, templateId, instructions, selectedMaterials, documentStyle: requestedStyle }) => {
  if (!editor) {
    window.alert('העורך עדיין נטען. נסה שוב בעוד רגע.');
    return;
  }
  if (!confirmReplaceCurrentDocument()) return;

  const generationRequest = beginGenerationRequest('doc');
  const originWorkspaceId = generationRequest.workspaceId;

  setLiveGeneration({
    active: true,
    state: 'running',
    prompt,
    summary: getLatestAgentRunSummary(getWorkspaceAutomation(), generationRequest.runId),
    logs: getRecentAgentLogs(18, { workspaceId: originWorkspaceId, runId: generationRequest.runId }),
    runId: generationRequest.runId,
    workspaceId: originWorkspaceId,
  });

  editor.commands.setContent(buildLiveGenerationShell(prompt));

  const result = await generateDocumentFromPrompt({
    prompt,
    templateId,
    instructions,
    selectedMaterials,
    runId: generationRequest.runId,
    returnMeta: true,
  });

  const generated = result?.html || `<h1>${escHtml(prompt)}</h1><p>לא נוצר תוכן.</p>`;
  editor.commands.setContent(generated);
}}
```

מה קורה כאן:

- ננעלת שליחה בלי עורך פעיל.
- נפתח מצב `liveGeneration` עם `runId` לזיהוי ריצה.
- מוצג שלד "מכין את המסמך בלייב...".
- מתבצעת קריאה לשכבת השירות `generateDocumentFromPrompt`.
- בסוף, התוכן שנוצר מוזרק לעורך.

## 2) בניית הבקשה למסמך בשכבת השירות

מקור: `src/services/workspaceLearningService.js` (`generateDocumentFromPrompt`)

```js
export async function generateDocumentFromPrompt({ prompt, templateId = 'blank', instructions = '', selectedMaterials = [], selectedModel, runId: providedRunId = '', returnMeta = false }) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('צריך לכתוב נושא או בקשה למסמך');

  const runId = String(providedRunId || `doc-${Date.now()}`).trim();
  const automation = getWorkspaceAutomation();

  const requestOptions = {
    runId,
    agentLabel: 'AUTOPILOT',
    activeWorkspaceId: requestWorkspaceId,
    workspaceName: requestWorkspaceName,
    expectDocumentOutput: true,
    appendAgentNotesToOutput: automation?.appendAgentNotesToOutput === true,
    agentNotesInstruction: automation?.appendAgentNotesToOutput === true
      ? String(automation?.agentNotesInstruction || '').trim()
      : '',
  };

  const response = await chatWithActiveProvider(
    `צור עבורי מסמך מלא בנושא: ${cleanPrompt}`,
    materialsText,
    `תפקידך לבנות מסמך שלם מוכן לעריכה בתוך WordFlow AI... החזר HTML בלבד...`,
    requestOptions,
  );

  const cleanedResponse = normalizeGeneratedHtmlResponse(response);
  return returnMeta
    ? { html: cleanedResponse, usedFallback: false, runId, errorMessage: '' }
    : cleanedResponse;
}
```

מה קורה כאן:

- מתבצע ניקוי ואימות קלט.
- מוזרמות הגדרות אוטומציה (`expectDocumentOutput`, נספח הערות סוכן).
- הקריאה המרכזית מתבצעת דרך `chatWithActiveProvider`.
- התשובה מנורמלת ל-HTML ומוחזרת.

## 3) ניהול אורקסטרציה, סוכנים והחלטות

מקור: `src/services/aiService.js`

### 3.1 דגלי מצב למסמך

```js
const expectDocumentOutput = options.expectDocumentOutput === true;
const appendAgentNotesToOutput = expectDocumentOutput && (options.appendAgentNotesToOutput === true || automation.appendAgentNotesToOutput === true);
const agentNotesInstruction = expectDocumentOutput
  ? String(options.agentNotesInstruction || automation.agentNotesInstruction || '').trim()
  : '';
```

משמעות:

- ההתנהגות המורחבת (כמו נספח הערות סוכן) מופעלת רק בזרימות מסמך.

### 3.2 בניית prompt לכל שלב סוכן

```js
const stagePrompt = buildStagePrompt({
  cleanUserPrompt,
  stageGoal,
  stageAgent,
  stagedOutput,
  batonNotes,
  planSummary: executionPlan?.summary || '',
  index: processedStages,
  total: maxStageCount,
  allowCircular: allowCircularWorkflow,
  roundIndex: runCount - 1,
  revisitReason: queueItem?.revisitReason || '',
  decisionMode,
  enabledAgents,
  agentNotesInstruction,
  collectAgentNotes: appendAgentNotesToOutput,
});
```

משמעות:

- כל שלב מקבל הקשר מלא: מטרה, תוצר ביניים, handoff, סבב, והוראות הערות סוכן.

### 3.3 התאוששות במקום כשלון במגבלת סבבים

```js
if (!expectDocumentOutput) {
  throw new Error('סקירת manager סופית דרשה סבב נוסף, אבל ה-workflow כבר הגיע למגבלת הסבבים.');
}

const recoveryAppendix = buildAgentNotesAppendix({
  stageNotes,
  notesInstruction: agentNotesInstruction,
  managerPacket: parsedManagerReply,
  managerLabel: managerAgent.name || 'מנהל העבודה',
  preferHtml: looksLikeHtmlDocument(managerArtifact || stagedOutput),
});

stagedOutput = appendNotesToOutput({
  output: managerArtifact || stagedOutput || cleanUserPrompt,
  appendix: recoveryAppendix,
});

logEvent('workflow-recovered', 'ה-workflow הגיע למגבלת סבבים, והוחזר מסמך מסכם עם הערות מנהל/מרצה', {
  state: 'success',
});
```

משמעות:

- בזרימת מסמך, במקום ליפול עם שגיאה: מוחזר תוצר מסכם עם נספח התאוששות.

### 3.4 החזרת תוצר סופי

```js
let finalOutput = String(stagedOutput || cleanUserPrompt).trim();
if (expectDocumentOutput && appendAgentNotesToOutput && !notesAlreadyAppended) {
  const appendix = buildAgentNotesAppendix({
    stageNotes,
    notesInstruction: agentNotesInstruction,
    managerPacket: lastManagerReviewPacket,
    managerLabel: 'מנהל העבודה',
    preferHtml: looksLikeHtmlDocument(finalOutput),
  });
  finalOutput = appendNotesToOutput({ output: finalOutput, appendix });
}

return rememberSuccessfulReply(finalOutput);
```

משמעות:

- התוצר הסופי נסגר ומוחזר למעלה, כולל נספח הערות כשמופעל.

## 4) חזרה ל-UI והצגת התוצאה למשתמש

מקור: `src/main.jsx` (חזרה מהקריאה)

```jsx
const result = await generateDocumentFromPrompt({ prompt, templateId, instructions, selectedMaterials, runId: generationRequest.runId, returnMeta: true });
const generated = result?.html || `<h1>${escHtml(prompt)}</h1><p>לא נוצר תוכן.</p>`;
const usedFallback = Boolean(result?.usedFallback);

editor.commands.setContent(generated);
saveDocumentHistory({ title: prompt, content: generated, templateId, source: 'start-screen' });
persistLocalCache(generated);
setLiveGeneration((prev) => ({
  ...prev,
  active: true,
  state: usedFallback ? 'warning' : 'success',
}));
```

מה קורה כאן:

- ה-HTML הסופי נכנס לעורך.
- ההיסטוריה והקאש המקומי מתעדכנים.
- מצב הריצה ב-UI משתנה ל-`success` או `warning` (אם הופעל fallback).

## 5) מסלול שגיאה ו-Fallback

מקור: `src/services/workspaceLearningService.js`

```js
} catch (error) {
  logAgentDebugEvent({
    type: 'doc-generation-fallback',
    state: 'error',
    runId,
    agentLabel: 'AUTOPILOT',
    message: 'יצירת המסמך עברה לשלד מקומי במקום תשובת AI',
    errorMessage: error?.message || 'שגיאה לא ידועה',
  });

  const fallbackHtml = buildLocalDraft(cleanPrompt, templateId, instructions, selectedMaterials);
  return returnMeta
    ? { html: fallbackHtml, usedFallback: true, runId, errorMessage: error?.message || 'שגיאה לא ידועה' }
    : fallbackHtml;
}
```

משמעות:

- גם כשהקריאה למודל נכשלה, המערכת מחזירה תוצר בסיסי ולא משאירה את המשתמש בלי מסמך.

---

## תקציר זרימה בקו אחד

`StartScreen -> onGenerateFromPrompt (main.jsx) -> generateDocumentFromPrompt (workspaceLearningService.js) -> chatWithActiveProvider + orchestration (aiService.js) -> HTML final/fallback -> editor.commands.setContent (main.jsx)`
