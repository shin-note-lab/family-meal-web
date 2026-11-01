
const BASE=Deno.env.get("SUPABASE_URL"),KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),PUB=Deno.env.get("SUPABASE_ANON_KEY"),NT=Deno.env.get("NOTION_API_TOKEN");
const DB={foods:"61e16ebf-d39a-4989-9c6b-a23f0c3a8524",menus:"0be67625-6be8-439a-b5e6-7d59ae500387",school_meals:"5c270fdb-c075-4d07-9e5b-a89f6673550d"};
const H={"Content-Type":"application/json","Access-Control-Allow-Origin":"https://shin-note-lab.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(status,x)=>new Response(JSON.stringify(x),{status,headers:H});
async function request(url,method="GET",body,headers={}){const r=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let v;try{v=JSON.parse(t)}catch{v={message:t.slice(0,250)}}if(!r.ok)throw Error(r.status+" "+JSON.stringify(v).slice(0,300));return v}
const n=(p,m,b)=>request("https://api.notion.com/v1"+p,m,b,{"Authorization":"Bearer "+NT,"Notion-Version":"2025-09-03","Content-Type":"application/json"});
const rich=s=>({rich_text:s?[{text:{content:String(s).slice(0,1900)}}]:[]}),title=s=>({title:[{text:{content:String(s||"未設定").slice(0,1900)}}]}),sel=s=>({select:{name:s||"未確認"}});
const rt=(p,k)=>p[k]?.rich_text?.map(x=>x.plain_text).join("")||"",sv=(p,k)=>p[k]?.select?.name||"";
function encode(t,r){if(t==="foods")return {"料理名":title(r.name),"料理カテゴリ":{multi_select:(r.categories||[]).map(name=>({name}))},"りょうの好み":sel(r.ryo_preference||"未確認"),"あおいの好み":sel(r.aoi_preference||"未確認"),"りょうの食べ方":rich(r.ryo_note),"あおいの食べ方":rich(r.aoi_note),"参考情報":rich(r.recipe_url),...(r.photo_source?{"写真出典":{url:r.photo_source}}:{})};if(t==="menus")return {"献立名":title(r.meal_date+"（"+r.meal_type+"）｜"+r.description?.slice(0,40)),"日付":{date:{start:r.meal_date}},"食事":sel(r.meal_type),"状態":sel(r.state||"候補"),"共通料理":rich(r.description),"備考":rich(r.notes)};return {"献立名":title(r.meal_date+"の給食"),"日付":{date:{start:r.meal_date}},"りょうの給食":rich(r.ryo_menu),"あおいの給食":rich(r.aoi_menu),"りょうの状況":sel(r.ryo_status||"未確認"),"あおいの状況":sel(r.aoi_status||"内容未確認")}}
function decode(t,p){const q=t.properties,id=t.id;if(p==="foods")return {id,name:q["料理名"]?.title?.map(x=>x.plain_text).join("")||"",categories:q["料理カテゴリ"]?.multi_select?.map(x=>x.name)||[],ryo_preference:sv(q,"りょうの好み"),aoi_preference:sv(q,"あおいの好み"),ryo_note:rt(q,"りょうの食べ方"),aoi_note:rt(q,"あおいの食べ方"),recipe_url:rt(q,"参考情報"),family_amounts:rt(q,"わが家の分量"),family_changes:rt(q,"わが家のアレンジ"),family_tips:rt(q,"わが家のコツ"),cooking_notes:rt(q,"作り方メモ"),photo_source:q["写真出典"]?.url||"",photo_url:q["料理写真"]?.files?.[0]?.file?.url||q["料理写真"]?.files?.[0]?.external?.url||"",updated_at:t.last_edited_time};if(p==="menus")return {id,meal_date:q["日付"]?.date?.start||"",meal_type:sv(q,"食事"),description:rt(q,"共通料理"),state:sv(q,"状態"),notes:rt(q,"備考"),updated_at:t.last_edited_time};return {id,meal_date:q["日付"]?.date?.start||"",ryo_menu:rt(q,"りょうの給食"),aoi_menu:rt(q,"あおいの給食"),ryo_status:sv(q,"りょうの状況"),aoi_status:sv(q,"あおいの状況")}}

function publicHttps(raw){
 const u=new URL(raw);if(u.protocol!=="https:"||u.username||u.password||u.port&&u.port!=="443")throw Error("URL_NOT_SUPPORTED");
 const h=u.hostname.toLowerCase().replace(/\.$/,"");if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".localhost")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(":")||!h.includes("."))throw Error("URL_NOT_SUPPORTED");
 return u;
}
async function safeFetch(raw,accept){
 let url=publicHttps(raw).href;
 for(let i=0;i<4;i++){
  const r=await fetch(url,{redirect:"manual",headers:{Accept:accept,"User-Agent":"Mozilla/5.0 (compatible; FamilyMealRecipePhoto/1.0)","Range":"bytes=0-4999999"},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get("location");if(!loc)throw Error("REDIRECT");url=publicHttps(new URL(loc,url).href).href;continue}
  if(!r.ok)throw Error("FETCH_"+r.status);
  return {response:r,url};
 }
 throw Error("TOO_MANY_REDIRECTS");
}
function extractRecipeImage(html,base){
 const scripts=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 const images=[];
 function walk(v,depth=0){if(depth>12||!v||typeof v!=="object")return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
 const types=Array.isArray(v["@type"])?v["@type"]:[v["@type"]];
 if(types.some(t=>typeof t==="string"&&t.toLowerCase().split("/").pop()==="recipe")){const imgs=Array.isArray(v.image)?v.image:[v.image];for(const im of imgs){if(typeof im==="string")images.push(im);else if(im&&typeof im==="object")images.push(im.url||im.contentUrl)}}
 for(const k of ["@graph","mainEntity","itemListElement"])if(v[k])walk(v[k],depth+1);
 }
 for(const sc of scripts){try{walk(JSON.parse(sc[1]))}catch{}}
 for(const im of images){if(im)try{return publicHttps(new URL(String(im).replace(/&amp;/g,"&"),base).href).href}catch{}}
 const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
 for(const key of ["og:image:secure_url","og:image","twitter:image"]){
  for(const m of metas){
   const prop=/(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m)?.[1];
   if(prop?.toLowerCase()!==key)continue;
   const value=/content\s*=\s*["']([^"']+)["']/i.exec(m)?.[1];
   if(value){const v=value.replace(/&amp;/g,"&");try{return publicHttps(new URL(v,base).href).href}catch{}}
  }
 }
 throw Error("RECIPE_IMAGE_NOT_FOUND");
}

function recipePhotoCandidates(html,base){
 const found=[];
 const add=(raw)=>{try{if(!raw)return;const u=publicHttps(new URL(String(raw).replace(/&amp;/g,"&"),base).href).href;if(!found.includes(u)&&found.length<24)found.push(u)}catch{}};
 try{add(extractRecipeImage(html,base))}catch{}
 const wakodo=/^https:\/\/community\.wakodo\.co\.jp\/community\/babyfood\/recipe_detail\//.test(base);
 if(wakodo){const id=new URL(base).searchParams.get("RECIPE_ID");if(/^\d{1,7}$/.test(id||""))add("https://community.wakodo.co.jp/community/babyfood/menu_img/"+id+".jpg")}
 for(const m of html.matchAll(/<img\b[^>]*>/gi)){const tag=m[0];const a=/(?:data-src|src|data-original|data-lazy-src)\s*=\s*["']([^"']+)["']/i.exec(tag);if(a)add(a[1])}
 return found;
}
function recipeStructuredData(html,expected){
 const scripts=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 const recipes=[];
 function walk(v,d=0){if(!v||typeof v!=="object"||d>12)return;if(Array.isArray(v)){v.forEach(x=>walk(x,d+1));return}
 const t=Array.isArray(v["@type"])?v["@type"]:[v["@type"]];
 if(t.some(x=>typeof x==="string"&&x.toLowerCase().split("/").pop()==="recipe"))recipes.push(v);
 for(const k of ["@graph","mainEntity","itemListElement"])if(v[k])walk(v[k],d+1);
 }
 for(const m of scripts){try{walk(JSON.parse(m[1]))}catch{}}
 const norm=x=>String(x||"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"").replace(/(?:鶏の|とりの|チキン)/g,"").replace(/(?:唐揚げ|から揚げ|からあげ|カラアゲ|から揚|唐あげ|竜田揚げ)/g,"からあげ");
 const target=norm(expected);
 const recipe=recipes.find(x=>{const n=norm(x.name);return n&&target&&(n.includes(target)||target.includes(n))});
 if(!recipe)throw Error("RECIPE_NAME_MISMATCH");
 const ingredients=Array.isArray(recipe.recipeIngredient)?recipe.recipeIngredient.filter(x=>typeof x==="string"):[];
 const steps=[];
 function step(v){if(typeof v==="string"){steps.push(v);return}if(Array.isArray(v)){v.forEach(step);return}if(v&&typeof v==="object"){if(v.text)steps.push(String(v.text));else if(v.itemListElement)step(v.itemListElement)}}
 step(recipe.recipeInstructions);
 if(!ingredients.length||!steps.length)throw Error("RECIPE_CONTENT_MISSING");
 const clean=x=>String(x).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
 const note="【材料】\n"+ingredients.map(x=>"・"+clean(x)).join("\n")+"\n\n【作り方】\n"+steps.map((x,i)=>(i+1)+". "+clean(x)).join("\n");
 if(note.length>1800)throw Error("RECIPE_TOO_LONG");
 return {title:String(recipe.name||""),note,ingredient_count:ingredients.length,step_count:steps.length};
}

async function uploadRecipePhoto(id,recipeUrl){
 const {response:page,url:pageUrl}=await safeFetch(recipeUrl,"text/html");
 if(!(page.headers.get("content-type")||"").toLowerCase().includes("text/html"))throw Error("NOT_HTML");
 const html=(await page.text()).slice(0,900000);
 const imageUrl=extractRecipeImage(html,pageUrl);
 const {response:img}=await safeFetch(imageUrl,"image/*");
 const type=(img.headers.get("content-type")||"").split(";")[0].toLowerCase();
 if(!["image/jpeg","image/png","image/webp"].includes(type))throw Error("IMAGE_FORMAT");
 const bytes=new Uint8Array(await img.arrayBuffer());
 if(bytes.length>4500000||bytes.length<100)throw Error("IMAGE_SIZE");
 const ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg";
 const upload=await n("/file_uploads","POST",{mode:"single_part",filename:"recipe-photo."+ext,content_type:type});
 const fd=new FormData();fd.append("file",new Blob([bytes],{type}),"recipe-photo."+ext);
 const sent=await fetch("https://api.notion.com/v1/file_uploads/"+upload.id+"/send",{method:"POST",headers:{"Authorization":"Bearer "+NT,"Notion-Version":"2025-09-03"},body:fd});
 if(!sent.ok)throw Error("UPLOAD_"+sent.status);
 return n("/pages/"+id,"PATCH",{properties:{"料理写真":{files:[{type:"file_upload",file_upload:{id:upload.id},name:"料理写真"}]},"写真出典":{url:pageUrl}}});
}

Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});if(req.method!=="POST")return out(405,{error:"METHOD"});if(req.headers.get("Origin")&&req.headers.get("Origin")!=="https://shin-note-lab.github.io")return out(403,{error:"ORIGIN"});try{if(!NT||!KEY||!PUB)return out(503,{error:"CONFIG"});const auth=req.headers.get("Authorization")||"";const u=await request(BASE+"/auth/v1/user","GET",undefined,{apikey:PUB,Authorization:auth});if(!u.id||!u.email_confirmed_at)return out(401,{error:"AUTH"});const m=await request(BASE+"/rest/v1/family_members?select=role,family_id&user_id=eq."+encodeURIComponent(u.id)+"&limit=1","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});if(!m.length||!["owner","member"].includes(m[0].role))return out(403,{error:"MEMBER"});const scope=await request(BASE+"/rest/v1/family_app_scope?select=family_id&id=eq.true&limit=1","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});if(!scope.length||m[0].family_id!==scope[0].family_id)return out(403,{error:"FAMILY_SCOPE"});const b=await req.json();
if(b.action==="family_members_list"){
 if(m[0].role!=="owner")return out(403,{error:"OWNER_ONLY"});
 const owner=await request(BASE+"/rest/v1/family_members?select=family_id&user_id=eq."+encodeURIComponent(u.id)+"&limit=1","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
 if(!owner.length)return out(403,{error:"FAMILY_NOT_FOUND"});
 const members=await request(BASE+"/rest/v1/family_members?select=user_id,role,created_at&family_id=eq."+encodeURIComponent(owner[0].family_id)+"&order=created_at.asc","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
 const rows=[];
 for(const member of members.slice(0,30)){
  try{
   const a=await request(BASE+"/auth/v1/admin/users/"+encodeURIComponent(member.user_id),"GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
   const user=a.user||a;
   rows.push({email:user.email||"",role:member.role,invited_at:user.invited_at||member.created_at,confirmed_at:user.email_confirmed_at||user.confirmed_at||null,last_sign_in_at:user.last_sign_in_at||null,status:user.last_sign_in_at?"used":(user.email_confirmed_at||user.confirmed_at)?"confirmed":"invited"});
  }catch{rows.push({email:"確認できません",role:member.role,status:"unknown"})}
 }
 return out(200,{members:rows});
}
if(b.action==="family_invite"){
 if(m[0].role!=="owner")return out(403,{error:"OWNER_ONLY"});
 const email=String(b.email||"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return out(400,{error:"INVALID_EMAIL"});
 const owner=await request(BASE+"/rest/v1/family_members?select=family_id&user_id=eq."+encodeURIComponent(u.id)+"&limit=1","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
 if(!owner.length)return out(403,{error:"FAMILY_NOT_FOUND"});
 const familyId=owner[0].family_id;
 let found=null,complete=false;
 for(let page=1;page<=10;page++){
  const result=await request(BASE+"/auth/v1/admin/users?page="+page+"&per_page=200","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
  const users=result.users||[];
  found=users.find(x=>String(x.email||"").toLowerCase()===email);
  if(found){complete=true;break}
  if(users.length<200){complete=true;break}
 }
 if(!complete)return out(503,{error:"USER_LOOKUP_LIMIT"});
 if(found){
  const existing=await request(BASE+"/rest/v1/family_members?select=family_id,role&user_id=eq."+encodeURIComponent(found.id)+"&limit=1","GET",undefined,{apikey:KEY,Authorization:"Bearer "+KEY});
  if(existing.length){
   if(existing[0].family_id!==familyId)return out(409,{error:"ALREADY_OTHER_FAMILY"});
   return out(409,{error:"ALREADY_MEMBER"});
  }
  return out(409,{error:"ACCOUNT_EXISTS"});
 }
 const invited=await request(BASE+"/auth/v1/invite?redirect_to="+encodeURIComponent("https://shin-note-lab.github.io/family-meal-web/"),"POST",{email},{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"});
 if(!invited.id)return out(502,{error:"INVITE_RESPONSE"});
 await request(BASE+"/rest/v1/family_members","POST",{family_id:familyId,user_id:invited.id,role:"member"},{apikey:KEY,Authorization:"Bearer "+KEY,Prefer:"resolution=merge-duplicates,return=minimal","Content-Type":"application/json"});
 return out(200,{invited:true});
}
if(b.action==="recipe_photo_preview_url"){
 if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});
 if(typeof b.recipe_url!=="string"||!b.recipe_url.trim())return out(400,{error:"RECIPE_URL_MISSING"});
 if(b.recipe_url.length>4096)return out(400,{error:"URL_NOT_SUPPORTED"});
 let recipeUrl;try{recipeUrl=publicHttps(b.recipe_url.trim()).href}catch{return out(400,{error:"URL_NOT_SUPPORTED"})}
 const result=await safeFetch(recipeUrl,"text/html");
 if(!(result.response.headers.get("content-type")||"").toLowerCase().includes("text/html"))return out(422,{error:"NOT_HTML"});
 const image_urls=recipePhotoCandidates((await result.response.text()).slice(0,900000),result.url);
 return out(200,{image_url:image_urls[0]||null,image_urls,recipe_url:result.url});
}
if(!DB[b.table]||!["list","create","update","delete","photo","photo_external","recipe_photo","photo_delete","recipe_photo_preview","recipe_photo_external","recipe_extract_preview","menu_upsert","recipe_notes_update","cooking_notes_update"].includes(b.action))return out(400,{error:"FIELDS"});if(b.action==="list"){let rows=[],cursor;do{const v=await n("/data_sources/"+DB[b.table]+"/query","POST",{page_size:100,...(cursor?{start_cursor:cursor}:{})});rows.push(...v.results.map(x=>decode(x,b.table)));cursor=v.has_more?v.next_cursor:null}while(cursor&&rows.length<1000);return out(200,{rows})}if(b.action==="menu_upsert"){
 if(b.table!=="menus")return out(400,{error:"MENU_ONLY"});
 const row=b.row||{},date=String(row.meal_date||""),type=String(row.meal_type||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!["朝","昼","夕","弁当","おやつ（午前）","おやつ（午後）"].includes(type)||!String(row.description||"").trim())return out(400,{error:"MENU_FIELDS"});
 const actual=row.state==="実食";
 const slotKey=date+"|"+type+"|"+(actual?"actual":"planned");
 const token=crypto.randomUUID();
 const lock=await request(BASE+"/rest/v1/rpc/claim_meal_slot","POST",{p_slot_key:slotKey,p_lease_token:token},{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"});
 if(lock!==true)return out(409,{error:"MEAL_SLOT_BUSY"});
 try{
 const filter={and:[{property:"日付",date:{equals:date}},{property:"食事",select:{equals:type}}]};
 let results=[],cursor;
 do{const v=await n("/data_sources/"+DB.menus+"/query","POST",{filter,page_size:100,...(cursor?{start_cursor:cursor}:{})});results.push(...v.results);cursor=v.has_more?v.next_cursor:null}while(cursor&&results.length<500);
 const same=results.filter(p=>(sv(p.properties,"状態")==="実食")===actual).sort((a,b)=>String(b.last_edited_time).localeCompare(String(a.last_edited_time)));
 const chosen=same[0];
 const page=chosen?await n("/pages/"+chosen.id,"PATCH",{properties:encode("menus",row)}):await n("/pages","POST",{parent:{type:"data_source_id",data_source_id:DB.menus},properties:encode("menus",row)});
 return out(200,{rows:[decode(page,"menus")],duplicate_count:Math.max(0,same.length-1)});
 }finally{
  try{await request(BASE+"/rest/v1/rpc/release_meal_slot","POST",{p_slot_key:slotKey,p_lease_token:token},{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"})}catch(e){console.error("meal lock release failed",String(e).slice(0,150))}
 }
 }if(b.action==="create"){const p=await n("/pages","POST",{parent:{type:"data_source_id",data_source_id:DB[b.table]},properties:encode(b.table,b.row)});return out(200,{rows:[decode(p,b.table)]})}if(!/^[a-f0-9-]{36}$/i.test(b.id||""))return out(400,{error:"ID"});const old=await n("/pages/"+b.id);if(old.parent?.data_source_id!==DB[b.table])return out(403,{error:"DATABASE"});if(b.action==="recipe_extract_preview"){
 if(b.table!=="foods")return out(400,{error:"FOOD_ONLY"});
 const url=rt(old.properties,"参考情報");
 if(!url)return out(422,{error:"RECIPE_URL_MISSING"});
 const result=await safeFetch(url,"text/html");
 if(!(result.response.headers.get("content-type")||"").toLowerCase().includes("text/html"))return out(422,{error:"NOT_HTML"});
 const html=(await result.response.text()).slice(0,900000);
 const name=old.properties["料理名"]?.title?.map(x=>x.plain_text).join("")||"";
 const extracted=recipeStructuredData(html,name);
 return out(200,{...extracted,source_url:result.url});
}
if(b.action==="cooking_notes_update"){
 if(b.table!=="foods")return out(400,{error:"FOOD_ONLY"});
 const note=String(b.row?.cooking_notes||"");
 if(note.length>1800)return out(400,{error:"NOTES_TOO_LONG"});
 const updated=await n("/pages/"+b.id,"PATCH",{properties:{"作り方メモ":rich(note)}});
 return out(200,{rows:[decode(updated,"foods")]});
}
if(b.action==="recipe_notes_update"){
 if(b.table!=="foods")return out(400,{error:"FOOD_ONLY"});
 const notes=b.row||{};
 const amount=String(notes.family_amounts||""),changes=String(notes.family_changes||""),tips=String(notes.family_tips||"");
 if(amount.length>1800||changes.length>1800||tips.length>1800)return out(400,{error:"NOTES_TOO_LONG"});
 const updated=await n("/pages/"+b.id,"PATCH",{properties:{"わが家の分量":rich(amount),"わが家のアレンジ":rich(changes),"わが家のコツ":rich(tips)}});
 return out(200,{rows:[decode(updated,"foods")]});
 }if(b.action==="delete"){await n("/pages/"+b.id,"PATCH",{archived:true});return out(200,{rows:[{id:b.id}]})}if(b.action==="recipe_photo_preview"){
 if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});
 const saved=rt(old.properties,"参考情報");if(!saved)return out(400,{error:"RECIPE_URL_MISSING"});
 const result=await safeFetch(saved,"text/html");const page=result.response;
 if(!(page.headers.get("content-type")||"").toLowerCase().includes("text/html"))return out(422,{error:"NOT_HTML"});
 const html=(await page.text()).slice(0,900000);
 const image_urls=recipePhotoCandidates(html,result.url);
 return out(200,{image_url:image_urls[0]||null,image_urls,recipe_url:result.url});
 }if(b.action==="recipe_photo_external"){
 if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});
 const saved=rt(old.properties,"参考情報");
 if(!saved)return out(400,{error:"RECIPE_URL_MISSING"});
 if(old.properties["料理写真"]?.files?.length&&!b.replace)return out(409,{error:"PHOTO_ALREADY_EXISTS"});
 const target=publicHttps(String(b.image_url||"")).href;
 const {response:recipePage,url:pageUrl}=await safeFetch(saved,"text/html");
 if(!(recipePage.headers.get("content-type")||"").toLowerCase().includes("text/html"))return out(422,{error:"NOT_HTML"});
 const candidates=recipePhotoCandidates((await recipePage.text()).slice(0,900000),pageUrl);
 if(!candidates.includes(target))return out(409,{error:"PHOTO_PREVIEW_CHANGED"});
 const {response:img}=await safeFetch(target,"image/*");
 const type=(img.headers.get("content-type")||"").split(";")[0].toLowerCase();
 if(!["image/jpeg","image/png","image/webp"].includes(type))return out(422,{error:"IMAGE_FORMAT"});
 const bytes=new Uint8Array(await img.arrayBuffer());
 if(bytes.length>4500000||bytes.length<100)return out(422,{error:"IMAGE_SIZE"});
 const ext=type==="image/png"?"png":type==="image/webp"?"webp":"jpg";
 const upload=await n("/file_uploads","POST",{mode:"single_part",filename:"recipe-photo."+ext,content_type:type});
 const fd=new FormData();fd.append("file",new Blob([bytes],{type}),"recipe-photo."+ext);
 const sent=await fetch("https://api.notion.com/v1/file_uploads/"+upload.id+"/send",{method:"POST",headers:{"Authorization":"Bearer "+NT,"Notion-Version":"2025-09-03"},body:fd});
 if(!sent.ok)throw Error("UPLOAD_"+sent.status);
 const page=await n("/pages/"+b.id,"PATCH",{properties:{"料理写真":{files:[{type:"file_upload",file_upload:{id:upload.id},name:"料理写真"}]},"写真出典":{url:pageUrl}}});
 return out(200,{rows:[decode(page,b.table)]});
 }if(b.action==="photo_delete"){if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});const page=await n("/pages/"+b.id,"PATCH",{properties:{"料理写真":{files:[]},"写真出典":{url:null}}});return out(200,{rows:[decode(page,b.table)]})}if(b.action==="recipe_photo"){
 if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});
 const saved=rt(old.properties,"参考情報");if(!saved)return out(400,{error:"RECIPE_URL_MISSING"});
 if(old.properties["料理写真"]?.files?.length&&!b.replace)return out(409,{error:"PHOTO_ALREADY_EXISTS"});
 const page=await uploadRecipePhoto(b.id,saved);return out(200,{rows:[decode(page,b.table)]});
 }if(b.action==="photo_external"){if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});const u=String(b.image_url||"");if(!/^https:\/\/(upload\.wikimedia\.org|commons\.wikimedia\.org)\//.test(u))return out(400,{error:"PHOTO_SOURCE"});const page=await n("/pages/"+b.id,"PATCH",{properties:{"料理写真":{files:[{name:"料理写真",type:"external",external:{url:u}}]},"写真出典":{url:String(b.photo_source||"")||null}}});return out(200,{rows:[decode(page,b.table)]})}if(b.action==="photo"){if(b.table!=="foods")return out(400,{error:"PHOTO_ONLY_FOODS"});const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.data_url||"");if(!match||match[2].length>4000000)return out(400,{error:"PHOTO_FORMAT_OR_SIZE"});const bytes=Uint8Array.from(atob(match[2]),x=>x.charCodeAt(0));const ext=match[1]==="image/png"?"png":match[1]==="image/webp"?"webp":"jpg";const upload=await n("/file_uploads","POST",{mode:"single_part",filename:"meal-photo."+ext,content_type:match[1]});const fd=new FormData();fd.append("file",new Blob([bytes],{type:match[1]}),"meal-photo."+ext);const sent=await fetch("https://api.notion.com/v1/file_uploads/"+upload.id+"/send",{method:"POST",headers:{"Authorization":"Bearer "+NT,"Notion-Version":"2025-09-03"},body:fd});if(!sent.ok)throw Error("UPLOAD "+sent.status+" "+(await sent.text()).slice(0,160));const page=await n("/pages/"+b.id,"PATCH",{properties:{"料理写真":{files:[{type:"file_upload",file_upload:{id:upload.id},name:"料理写真"}]}}});return out(200,{rows:[decode(page,b.table)]})}const p=await n("/pages/"+b.id,"PATCH",{properties:encode(b.table,b.row)});return out(200,{rows:[decode(p,b.table)]})}catch(e){console.error("photo operation failed",String(e.message).slice(0,200));return out(502,{error:String(e.message).slice(0,350)})}});
