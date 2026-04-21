const fs = require('fs');
let content = fs.readFileSync('src/ProfileOnboarding.jsx', 'utf8');

// Reduce minimum height to fit screen better
content = content.replace(/min-h-\[750px\]/g, 'h-full min-h-[500px] flex flex-col justify-center py-4');
content = content.replace(/max-w-4xl/g, 'w-full max-w-[95%]');
content = content.replace(/mt-8/g, 'mt-2');

// Reduce vertical spacing globally
content = content.replace(/space-y-6/g, 'space-y-3');
content = content.replace(/space-y-5/g, 'space-y-3');
content = content.replace(/space-y-4/g, 'space-y-2');

// Make inputs more compact
content = content.replace(/py-3/g, 'py-1.5');
content = content.replace(/mb-6/g, 'mb-2');
content = content.replace(/mb-8/g, 'mb-3');
content = content.replace(/px-8/g, 'px-4');
content = content.replace(/pb-8/g, 'pb-4');
content = content.replace(/p-6/g, 'p-4');

// text resizing
content = content.replace(/text-3xl/g, 'text-xl');
content = content.replace(/text-2xl/g, 'text-lg');
content = content.replace(/text-lg/g, 'text-base');
content = content.replace(/text-base leading-relaxed/g, 'text-sm leading-relaxed');

// Labels bottom margin
content = content.replace(/mb-2/g, 'mb-1');

// text area rows reduction
content = content.replace(/rows=\{3\}/g, 'rows={2}');

fs.writeFileSync('src/ProfileOnboarding.jsx', content);
console.log('UI compacted successfully.');
