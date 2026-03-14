const fs = require('fs');
const path = require('path');

const token = "EAAbmM6HZAkbUBQZBr1T8eHCuEgRnTHVZANcVDL0j2gpZCGu7kTthXaRGfwJeB7iwemJPqPWIAS8WWhLXSUIK4U1UK657hpLCyX5SUN0FYmx3qyFHakIiO69KhqaAAnkragKDyZCQdrpvrI5kdCHGZAy4rePuyyGMWTUy00FrdAgZCj6KyZAHA4rJq7hWxLloHbHH3tO0ZCJEcrqcXTIdDYAsbNyKiZByys1yfWH2IBzbdF1dv7";
const pageId = "1042016035659143";
const igId = "17841444855543301";

function cleanEnv(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/^FB_ACCESS_TOKEN=.*/m, `FB_ACCESS_TOKEN=${token}`);
    content = content.replace(/^FACEBOOK_PAGE_ID=.*/m, `FACEBOOK_PAGE_ID=${pageId}`);
    if (!content.includes('FACEBOOK_PAGE_ID=')) {
        content = content.replace(/^FB_ACCESS_TOKEN=.*\n/m, `FB_ACCESS_TOKEN=${token}\nFACEBOOK_PAGE_ID=${pageId}\n`);
    }
    content = content.replace(/^IG_USER_ID=.*/m, `IG_USER_ID=${igId}`);
    content = content.replace(/^INSTAGRAM_BUSINESS_ACCOUNT_ID=.*/m, `INSTAGRAM_BUSINESS_ACCOUNT_ID=${igId}`);
    if (!content.includes('INSTAGRAM_BUSINESS_ACCOUNT_ID=')) {
        content = content.replace(/^IG_USER_ID=.*\n/m, `IG_USER_ID=${igId}\nINSTAGRAM_BUSINESS_ACCOUNT_ID=${igId}\n`);
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Cleaned ${filePath}`);
}

cleanEnv('c:\\ArtistAgent\\.env');
cleanEnv('c:\\ArtistAgent\\scheduler\\.env');
