export function hasMaintenanceAccess(request, env) {
  const expected=env.COMPASS_UPDATE_PROOF;
  const proof=request.headers.get('X-Compass-Update-Key')||'';
  if(typeof expected!=='string'||! /^[a-f0-9]{64}$/.test(expected)||! /^[a-f0-9]{64}$/.test(proof))return false;
  let diff=0;for(let i=0;i<64;i++)diff|=proof.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export const maintenanceAuthHelp={
  error:'此接口仅供后台维护，公开访客可通过 GET /api/data 读取最新内容。自动更新任务请按 maintenanceAuthorization 补充维护凭据后重试。',
  maintenanceAuthorization:{credentialSource:'Sites get_site.siwc_bypass_bearer_token for this Site',proofHeader:'X-Compass-Update-Key',proofAlgorithm:'SHA-256 of UTF-8 token, lowercase hexadecimal',platformHeader:'OAI-Sites-Authorization: Bearer <token>',handling:'Keep tokens and proofs in session memory; never print or save them. Send credentials only to this Site.'}
};
