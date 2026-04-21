const fs = require('fs');
let code = fs.readFileSync('src/FileMenu.jsx', 'utf8');

if (!code.includes('import ProfileOnboarding')) {
  code = "import ProfileOnboarding from './ProfileOnboarding';\n" + code;
}

const startMarker = "<div style={{ border: '1px solid #DDD6FE'";
const endMarker = "<div style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: '14px', background: '#F8FBFF', marginBottom: 12 }}>\n        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>\n          <div style={{ fontSize: 13, color: '#1E3A8A', fontWeight: 700 }}>העלה קבצים ללמידת סגנון";

const bIndex = code.indexOf(startMarker);
const eIndex = code.indexOf(endMarker);

if (bIndex > -1 && eIndex > -1) {
  const beforeStartStr = code.substring(0, bIndex);
  const afterEndStr = code.substring(eIndex);

  const componentStr = "<ProfileOnboarding profile={profile} updateField={updateField} updateList={updateList} STYLE_TRAINING_QUESTIONS={STYLE_TRAINING_QUESTIONS} STYLE_PRESET_OPTIONS={STYLE_PRESET_OPTIONS} trainingAnswers={trainingAnswers} selectLearningOption={selectLearningOption} toggleStyle={toggleStyle} resetLearningGame={resetLearningGame} />\n\n      ";

  const newCode = beforeStartStr + componentStr + afterEndStr;
  fs.writeFileSync('src/FileMenu.jsx', newCode);
  console.log('Successfully replaced!');
} else {
  console.log('Could not find markers');
}
