/* SANA AL-AMAR admin | read-only preview or authenticated Supabase session.
   Public key is intentionally publishable; only Supabase RLS authorizes writes. */
const CONFIG = { url:"https://sseugkalnlclovwhxiys.supabase.co", publishableKey:"sb_publishable_NPfWrDpXNNlob6YzG0EGJg_KRFDmz0O" };
const AUTH_KEY="sana_admin_session_v1";
const PREVIEW=new URLSearchParams(location.search).get("preview")==="1";
const STAFF_ROLES=new Set(["admin","editor"]);
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const text=v=>String(v??"").trim();
const slugify=v=>text(v).normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,145);
const dateLabel=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("ar-IQ",{year:"numeric",month:"short",day:"numeric"}).format(d)};
const icon=id=>'<svg><use href="#i-'+id+'"/></svg>';
const imgSrc=v=>/^https:\/\//i.test(text(v))?text(v):"";
const intOrNull=v=>v===""||v==null?null:Number(v);
const stateLabels={new:"قيد المراجعة",contacted:"تم التواصل",confirmed:"مؤكدة",completed:"مكتملة",cancelled:"ملغاة",rejected:"مرفوضة"};
let session=null,currentUser=null,courses=[],offerings=[],registrations=[],trainees=[],courseProtection=[],editingId=null,editingTraineeId=null,filter="";
let screen="dashboard";
let pendingCourseCover=null,courseCoverObjectUrl=null;
const COURSE_COVER_MAX_BYTES=5*1024*1024;
const COURSE_COVER_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
function resetCourseCover(){
  pendingCourseCover=null;
  $("courseCoverFile").value="";
  if(courseCoverObjectUrl){URL.revokeObjectURL(courseCoverObjectUrl);courseCoverObjectUrl=null}
}
function previewCourseCover(url){
  const preview=$("courseCoverPreview"),img=$("courseCoverPreviewImg"),hint=$("courseCoverHint");
  const src=url&&(url.startsWith("blob:")||imgSrc(url))?url:"";
  preview.classList.toggle("hidden",!src);
  if(src)img.src=src;else img.removeAttribute("src");
  hint.textContent=pendingCourseCover?"الصورة محددة، سيتم رفعها عند حفظ الدورة.":"";
}
function onCourseCoverFile(){
  const file=$("courseCoverFile").files?.[0];
  if(!file){resetCourseCover();previewCourseCover(text($("courseForm").elements.namedItem("cover_image_url").value));return}
  if(!Object.hasOwn(COURSE_COVER_TYPES,file.type)||!file.size||file.size>COURSE_COVER_MAX_BYTES){
    resetCourseCover();previewCourseCover(text($("courseForm").elements.namedItem("cover_image_url").value));
    $("formMessage").textContent="اختر صورة JPG أو PNG أو WebP، بحجم لا يتجاوز 5 ميغابايت.";return;
  }
  resetCourseCover();
  pendingCourseCover=file;
  courseCoverObjectUrl=URL.createObjectURL(file);
  $("formMessage").textContent="";
  previewCourseCover(courseCoverObjectUrl);
}
async function uploadCourseCover(file){
  if(!Object.hasOwn(COURSE_COVER_TYPES,file.type)||!file.size||file.size>COURSE_COVER_MAX_BYTES)
    throw new Error("الصورة غير مدعومة أو أكبر من 5 ميغابايت.");
  const name=crypto.randomUUID()+"."+COURSE_COVER_TYPES[file.type];
  const path="courses/"+name;
  await http("/storage/v1/object/course-covers/"+path,{
    method:"POST",
    headers:{"Content-Type":file.type,"cache-control":"3600","x-upsert":"false"},
    body:file
  });
  return CONFIG.url+"/storage/v1/object/public/course-covers/"+path;
}

const pendingDraftDeletes=new Map();
let draftUndoTicker=null;
function displayedCourses(){return courses.filter(c=>!c.is_archived&&!pendingDraftDeletes.has(String(c.id)))}
function hasProtectedRecords(id){
  const status=courseProtection.find(v=>String(v.course_id)===String(id));
  return status?status.has_protected_records===true:true;
}
function renderUndoStack(){
  const stack=$("draftUndoStack");if(!stack)return;
  const now=Date.now();
  stack.innerHTML=[...pendingDraftDeletes.entries()].map(([id,item])=>{
    const seconds=Math.max(0,Math.ceil((item.deadline-now)/1000));
    const deleting=item.state==="deleting";
    return '<div class="draft-undo-item"><div class="draft-undo-text"><strong>'+escapeHTML(item.course.title_ar)+'</strong><span>'+(deleting?"جارٍ إتمام حذف المسودة...":"سيتم الحذف النهائي بعد "+seconds+" ثوانٍ")+'</span></div>'+(deleting?"":'<button type="button" class="draft-undo-button" data-undo="'+escapeHTML(id)+'">تراجع</button>')+'</div>';
  }).join("");
}
function refreshDraftUndoTicker(){
  if(pendingDraftDeletes.size&&!draftUndoTicker){
    draftUndoTicker=setInterval(()=>{
      for(const [id,item] of pendingDraftDeletes){
        if(item.state==="undoable"&&Date.now()>=item.deadline)void commitDraftDelete(id);
      }
      renderUndoStack();
    },250);
  }else if(!pendingDraftDeletes.size&&draftUndoTicker){
    clearInterval(draftUndoTicker);draftUndoTicker=null;
  }
}
function undoDraftDelete(id){
  const item=pendingDraftDeletes.get(String(id));
  if(!item||item.state!=="undoable")return;
  if(Date.now()>=item.deadline){void commitDraftDelete(String(id));return}
  clearTimeout(item.timer);pendingDraftDeletes.delete(String(id));
  refreshDraftUndoTicker();renderUndoStack();renderAll();
  setNotice("تم التراجع عن حذف المسودة: "+item.course.title_ar);
}
function cancelPendingOnLogout(){
  for(const item of pendingDraftDeletes.values())clearTimeout(item.timer);
  pendingDraftDeletes.clear();refreshDraftUndoTicker();renderUndoStack();
}

const sampleCourse={id:"demo-1",title_ar:"دورة تجريبية لمعاينة التصميم",title_en:"Design Preview Course",slug:"design-preview",short_description_ar:"هذا مثال بصري فقط وليس دورة منشورة أو مسجّلة فعلياً.",is_published:false,is_featured:false,cover_image_url:null,created_at:"2026-10-23T12:00:00Z"};
const headers=(token=session?.access_token)=>({
  apikey:CONFIG.publishableKey,
  ...(token?{Authorization:"Bearer "+token}:{}),
  "Content-Type":"application/json"
});
async function http(path,opts={},canRetry=true){
  if(!PREVIEW && session?.expires_at && Date.now()/1000>session.expires_at-75)await refreshSession();
  const response=await fetch(CONFIG.url+path,{...opts,headers:{...headers(),...(opts.headers||{})}});
  if(response.status===401&&canRetry&&session?.refresh_token){
    await refreshSession();return http(path,opts,false);
  }
  const body=await response.text();
  let data;try{data=body?JSON.parse(body):null}catch{data=body}
  if(!response.ok){
    const message=typeof data==="object"?(data?.message||data?.msg||data?.error_description||data?.error||data?.hint):null;
    throw new Error(message||("Request failed: "+response.status));
  }
  return data;
}
async function refreshSession(){
  if(!session?.refresh_token)throw new Error("انتهت الجلسة؛ يرجى تسجيل الدخول");
  const response=await fetch(CONFIG.url+"/auth/v1/token?grant_type=refresh_token",{
    method:"POST",headers:headers(null),
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  if(!response.ok){sessionStorage.removeItem(AUTH_KEY);session=null;throw new Error("انتهت جلسة الدخول؛ أعد تسجيل الدخول");}
  session=await response.json();
  session.expires_at=Math.floor(Date.now()/1000)+Number(session.expires_in||3600);
  sessionStorage.setItem(AUTH_KEY,JSON.stringify(session));
}
async function signIn(email,password){
  const response=await fetch(CONFIG.url+"/auth/v1/token?grant_type=password",{
    method:"POST",headers:headers(null),body:JSON.stringify({email,password})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error_description||data.msg||"بيانات الدخول غير صحيحة");
  session={...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
  const user=await http("/auth/v1/user");
  if(!STAFF_ROLES.has(user?.app_metadata?.sana_role)){session=null;throw new Error("هذا الحساب لا يملك صلاحية دخول لوحة الإدارة");}
  currentUser=user;
  sessionStorage.setItem(AUTH_KEY,JSON.stringify(session));
}
async function authenticateSaved(){
  const value=sessionStorage.getItem(AUTH_KEY);
  if(!value)return false;
  try{
    session=JSON.parse(value);
    if(!session?.access_token)return false;
    currentUser=await http("/auth/v1/user");
    if(!STAFF_ROLES.has(currentUser?.app_metadata?.sana_role))throw new Error("غير مصرح");
    return true;
  }catch{session=null;sessionStorage.removeItem(AUTH_KEY);return false;}
}
function showApp(){
  $("authGate").classList.add("hidden");$("appShell").classList.remove("hidden");
  $("modeTag").classList.toggle("hidden",!PREVIEW);
  $("staffName").textContent=PREVIEW?"وضع المعاينة":(currentUser?.email||"مدير النظام");
  $("staffRole").textContent=PREVIEW?"Preview only":(currentUser?.app_metadata?.sana_role||"Staff");
  document.querySelectorAll("#appShell button").forEach(b=>{if(b.id==="logoutButton")b.title=PREVIEW?"العودة للدخول":"تسجيل الخروج"});
}
function setNotice(message,error=false){
  const box=$("noticeBox");if(!message){box.classList.add("hidden");return}
  box.textContent=message;box.className="notice-box"+(error?" error":"");box.scrollIntoView({block:"nearest"});
}
function loginMessage(message){$("loginMessage").textContent=message}
async function listData(){
  if(PREVIEW){courses=[sampleCourse];offerings=[];registrations=[];trainees=[];courseProtection=[];renderAll();return}
  try{
    const [courseRows,offeringRows,requestRows,traineeRows,protectionRows]=await Promise.all([
      http("/rest/v1/courses?select=id,title_ar,title_en,slug,short_description_ar,outline_ar,cover_image_url,certificate_type,is_featured,is_published,is_archived,archived_at,created_at,updated_at&order=updated_at.desc&limit=300"),
      http("/rest/v1/course_year_offerings?select=id,course_id,training_year,delivery_mode,duration_days,duration_hours,seat_capacity,target_audience_ar,audience_scope,is_published&order=training_year.desc&limit=800"),
      http("/rest/v1/registration_requests?select=id,course_id,trainee_id,full_name,phone,email,organization,notes,status,contacted_at,created_at&order=created_at.desc&limit=1000"),
      http("/rest/v1/trainees?select=id,full_name,phone,email,organization,notes,created_at,updated_at&order=updated_at.desc&limit=1000"),
      http("/rest/v1/sana_course_archive_status?select=course_id,has_protected_records&limit=1000")
    ]);
    courses=courseRows||[];offerings=offeringRows||[];registrations=requestRows||[];trainees=traineeRows||[];courseProtection=protectionRows||[];
    setNotice("");renderAll();
  }catch(error){setNotice("تعذّر تحميل البيانات: "+error.message,true)}
}
function offeringFor(courseId){return offerings.filter(o=>String(o.course_id)===String(courseId)).sort((a,b)=>b.training_year-a.training_year)[0]}
function metric(label,value,color,ic){
  return '<div class="metric"><div><p>'+escapeHTML(label)+'</p><strong>'+escapeHTML(value)+'</strong></div><span class="metric-icon '+color+'">'+icon(ic)+'</span></div>';
}
function statusLabel(published,archived=false){
  return '<span class="status-pill '+(archived?"archived":published?"published":"draft")+'">'+(archived?"مؤرشفة":published?"منشورة":"مسودة")+'</span>';
}
function coverHTML(row){
  const src=imgSrc(row.cover_image_url);
  return '<div class="cover">'+(src?'<img src="'+escapeHTML(src)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':icon("graduation"))+'</div>';
}
function requestName(r){const c=courses.find(v=>String(v.id)===String(r.course_id));return c?.title_ar||"الدورة غير متاحة"}
function renderDashboard(){
  const shownCourses=displayedCourses();
  $("metrics").innerHTML=[
    metric("إجمالي الدورات",shownCourses.length,"","graduation"),
    metric("الدورات المنشورة",shownCourses.filter(x=>x.is_published).length,"green","book"),
    metric("مسودات الدورات",shownCourses.filter(x=>!x.is_published).length,"orange","edit"),
    metric("طلبات بانتظار المراجعة",registrations.filter(x=>x.status==="new").length,"red","requests")
  ].join("");
  const latest=shownCourses.slice(0,3);
  $("latestCourses").innerHTML=latest.length?latest.map(c=>
    '<article class="mini-card">'+coverHTML(c)+'<div class="caption"><h3>'+escapeHTML(c.title_ar)+'</h3><small>'+statusLabel(c.is_published)+'</small></div></article>'
  ).join(""):empty("لا توجد دورات محفوظة حتى الآن");
  $("recentRequests").innerHTML=registrations.slice(0,5).map(r=>
    '<div class="compact-row"><div><strong>'+escapeHTML(requestName(r))+'</strong><br><span>'+escapeHTML(r.full_name)+'</span></div><div><span>'+escapeHTML(dateLabel(r.created_at))+'</span><br><span>'+escapeHTML(stateLabels[r.status]||r.status)+'</span></div></div>'
  ).join("")||empty("ماكو طلبات تسجيل حالياً");
  const count=registrations.filter(r=>r.status==="new").length;
  $("pendingBadge").textContent=count;$("pendingBadge").classList.toggle("hidden",count===0);
}
function empty(message){return '<div class="empty-state">'+icon("book")+'<p>'+escapeHTML(message)+'</p></div>'}
function renderCourses(){
  const term=($("courseSearch").value||$("globalSearch").value||"").toLocaleLowerCase();
  const selected=$("courseFilter").value;
  const filtered=courses.filter(c=>!pendingDraftDeletes.has(String(c.id))&&
    (selected==="archived"?c.is_archived:!c.is_archived&&
    (selected==="all"||(selected==="published"&&c.is_published)||(selected==="draft"&&!c.is_published)))&&
    [c.title_ar,c.title_en,c.slug].some(v=>text(v).toLocaleLowerCase().includes(term)));
  $("courseList").innerHTML=filtered.length?filtered.map(c=>{
    const o=offeringFor(c.id);
    const admin=!PREVIEW&&currentUser?.app_metadata?.sana_role==="admin";
    const protectedRecords=hasProtectedRecords(c.id);
    let managementButton="";
    if(admin&&c.is_archived){
      managementButton='<button type="button" class="btn btn-restore-course" data-restore="'+escapeHTML(c.id)+'">استرجاع الدورة</button>';
    }else if(admin&&!c.is_published){
      managementButton=protectedRecords?
        '<button type="button" class="btn btn-archive-course" data-archive="'+escapeHTML(c.id)+'">أرشفة</button>':
        '<button type="button" class="btn btn-delete-draft" data-delete="'+escapeHTML(c.id)+'">حذف المسودة</button>';
    }
    const publicationButton=c.is_archived?"":'<button class="btn '+(c.is_published?"btn-outline":"btn-primary")+'" data-publish="'+escapeHTML(c.id)+'">'+(c.is_published?"إلغاء النشر":"نشر الدورة")+'</button>';
    const recordHint=protectedRecords&&!c.is_archived&&!c.is_published?'<p class="archive-record-hint">مرتبطة بسجلات محفوظة: الأرشفة تحافظ عليها.</p>':"";
    return '<article class="course-card">'+coverHTML(c)+'<div class="course-info"><div style="display:flex;justify-content:space-between;align-items:center">'+statusLabel(c.is_published,c.is_archived)+'<small style="color:#70889a">'+escapeHTML(o?.training_year||"بدون سنة")+'</small></div><h3>'+escapeHTML(c.title_ar)+'</h3><p>'+escapeHTML(c.short_description_ar||"أضف نبذة مختصرة عن الدورة من لوحة التعديل")+'</p><div class="course-meta"><span>▣ '+escapeHTML(o?.duration_days?o.duration_days+" أيام":"المدة غير محددة")+'</span><span>◉ '+escapeHTML(o?.delivery_mode==="online"?"أونلاين":o?.delivery_mode==="hybrid"?"مدمج":o?.delivery_mode?"حضوري":"غير محدد")+'</span><span>♙ '+escapeHTML(o?.seat_capacity?"المقاعد "+o.seat_capacity:"المقاعد غير محددة")+'</span></div>'+recordHint+'<div class="card-foot"><button class="btn btn-outline" data-edit="'+escapeHTML(c.id)+'">'+icon("edit")+' تعديل</button>'+publicationButton+managementButton+'</div></div></article>';
  }).join(""):empty(selected==="archived"?"لا توجد دورات مؤرشفة حالياً":"ماكو دورات تطابق البحث أو الفلتر");
  if(PREVIEW)$("addCourse").disabled=true;
}

function requestStatusOptions(value){
  return Object.entries(stateLabels).map(([key,label])=>
    '<option value="'+escapeHTML(key)+'"'+(key===value?' selected':'')+'>'+escapeHTML(label)+'</option>'
  ).join("");
}
function matchQuery(record,q){
  return Object.values(record).some(v=>String(v??"").toLocaleLowerCase().includes(q));
}
function renderRequests(){
  const search=text($("requestSearch").value).toLocaleLowerCase();
  const status=$("requestFilter").value;
  const filtered=registrations.filter(r=>(status==="all"||r.status===status)&&
    [r.full_name,r.phone,r.email,r.organization,requestName(r),r.id].some(v=>text(v).toLocaleLowerCase().includes(search)));
  $("requestCount").textContent=filtered.length+" طلب من أصل "+registrations.length;
  $("requestRows").innerHTML=filtered.length?filtered.map(r=>
    '<tr><td>#'+escapeHTML(r.id)+'</td><td><strong>'+escapeHTML(r.full_name)+'</strong></td><td>'+escapeHTML(r.phone)+'</td><td>'+escapeHTML(requestName(r))+'</td><td>'+escapeHTML(dateLabel(r.created_at))+'</td><td><select aria-label="تغيير حالة الطلب" class="request-status" data-request="'+escapeHTML(r.id)+'" '+(PREVIEW?"disabled":"")+'>'+requestStatusOptions(r.status)+'</select></td><td><button type="button" class="btn btn-outline btn-small" data-request-detail="'+escapeHTML(r.id)+'">تفاصيل</button></td></tr>'
  ).join(""):'<tr><td colspan="7" class="no-results">لا توجد طلبات تسجيل مطابقة</td></tr>';
}
function traineeRegistrationCount(id){
  return registrations.filter(r=>String(r.trainee_id)===String(id)).length;
}
function renderTrainees(){
  const query=text($("traineeSearch").value).toLocaleLowerCase();
  const filtered=trainees.filter(t=>[t.full_name,t.phone,t.email,t.organization,t.id].some(v=>text(v).toLocaleLowerCase().includes(query)));
  $("traineeCount").textContent=filtered.length+" متدرب من أصل "+trainees.length;
  $("traineeRows").innerHTML=filtered.length?filtered.map(t=>
    '<tr><td>#'+escapeHTML(t.id)+'</td><td><strong>'+escapeHTML(t.full_name)+'</strong></td><td>'+escapeHTML(t.phone||"—")+'</td><td>'+escapeHTML(t.email||"—")+'</td><td>'+escapeHTML(t.organization||"—")+'</td><td>'+traineeRegistrationCount(t.id)+'</td><td><button type="button" class="btn btn-outline btn-small" data-trainee-edit="'+escapeHTML(t.id)+'">عرض / تعديل</button></td></tr>'
  ).join(""):'<tr><td colspan="7" class="no-results">لا توجد سجلات متدربين مطابقة. تگدر تضيف أول متدرب من الزر أعلاه.</td></tr>';
}
function openTrainee(id=null){
  if(PREVIEW){setNotice("المعاينة لا تسمح بإضافة أو تعديل بيانات حقيقية.");return}
  editingTraineeId=id;
  const form=$("traineeForm");form.reset();$("traineeFormMessage").textContent="";
  const t=trainees.find(x=>String(x.id)===String(id));
  $("traineeDialogTitle").textContent=t?"ملف المتدرب وتعديل بياناته":"إضافة متدرب جديد";
  for(const field of ["full_name","phone","email","organization","notes"])
    form.elements.namedItem(field).value=t?.[field]||"";
  const related=t?registrations.filter(r=>String(r.trainee_id)===String(t.id)):[];
  $("traineeHistory").innerHTML=t?'<h3>سجل طلبات التسجيل المرتبطة</h3>'+(related.length?
    related.map(r=>'<div class="trainee-history-row"><span>'+escapeHTML(requestName(r))+'</span><span>'+escapeHTML(stateLabels[r.status]||r.status)+'</span><small>'+escapeHTML(dateLabel(r.created_at))+'</small></div>').join(""):
    '<p class="muted">ماكو طلبات مرتبطة بهذا المتدرب حالياً.</p>'):"";
  $("traineeDialog").showModal();
}
async function saveTrainee(event){
  event.preventDefault();
  if(PREVIEW)return;
  const f=new FormData($("traineeForm")),v=k=>text(f.get(k));
  const data={full_name:v("full_name"),phone:v("phone")||null,email:v("email")||null,organization:v("organization")||null,notes:v("notes")||null};
  if(data.full_name.length<2){$("traineeFormMessage").textContent="اسم المتدرب لازم يكون حرفين على الأقل.";return}
  const button=$("saveTrainee");button.disabled=true;$("traineeFormMessage").textContent="جارٍ الحفظ...";
  try{
    const path=editingTraineeId?"/rest/v1/trainees?id=eq."+encodeURIComponent(editingTraineeId):"/rest/v1/trainees";
    const rows=await http(path,{method:editingTraineeId?"PATCH":"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(data)});
    if(!rows?.length)throw Error("ما تأكد حفظ بيانات المتدرب.");
    $("traineeDialog").close();await listData();showScreen("trainees");
    setNotice("تم حفظ بيانات المتدرب بنجاح.");
  }catch(error){$("traineeFormMessage").textContent="تعذر حفظ المتدرب: "+error.message}
  finally{button.disabled=false}
}
function openRequestDetails(id){
  const r=registrations.find(x=>String(x.id)===String(id));if(!r)return;
  const field=(label,v)=>'<div class="request-field"><small>'+escapeHTML(label)+'</small><strong>'+escapeHTML(v||"—")+'</strong></div>';
  $("requestDetailsTitle").textContent="طلب التسجيل #"+r.id;
  $("requestDetailFields").innerHTML=
    field("اسم المتدرب",r.full_name)+field("رقم الهاتف",r.phone)+
    field("البريد الإلكتروني",r.email)+field("الشركة / جهة العمل",r.organization)+
    field("الدورة المطلوبة",requestName(r))+field("تاريخ التقديم",dateLabel(r.created_at))+
    field("حالة الطلب",stateLabels[r.status]||r.status)+field("تاريخ التواصل",dateLabel(r.contacted_at))+
    '<div class="request-field wide"><small>الملاحظات</small><strong class="multiline">'+escapeHTML(r.notes||"لا توجد ملاحظات")+'</strong></div>';
  const linked=trainees.find(t=>String(t.id)===String(r.trainee_id));
  $("requestTraineeLink").textContent=linked?"مرتبط بملف المتدرب: "+linked.full_name:"لم يتم ربط الطلب بملف متدرب بعد.";
  $("approveTraineeButton").classList.toggle("hidden",!!linked||PREVIEW);
  $("approveTraineeButton").dataset.requestId=r.id;
  $("requestDetailsMessage").textContent="";
  $("requestDialog").showModal();
}
async function approveRequestTrainee(id){
  if(PREVIEW)return;
  const r=registrations.find(x=>String(x.id)===String(id));if(!r||r.trainee_id)return;
  const button=$("approveTraineeButton");button.disabled=true;$("requestDetailsMessage").textContent="جارٍ ربط سجل المتدرب...";
  try{
    const phone=text(r.phone).replace(/[^0-9+]/g,""),email=text(r.email).toLocaleLowerCase();
    const matching=trainees.filter(t=>(phone&&text(t.phone).replace(/[^0-9+]/g,"")===phone)||
      (email&&text(t.email).toLocaleLowerCase()===email));
    if(matching.length>1)throw Error("وجدت أكثر من ملف بنفس الهاتف أو البريد. راجع الملفات قبل الربط.");
    let trainee=matching[0];
    if(trainee){
      if(!window.confirm('الطلب يطابق ملف المتدرب "'+trainee.full_name+'". ربط الطلب بهذا الملف؟'))return;
    }else{
      const rows=await http("/rest/v1/trainees",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
        full_name:r.full_name,phone:r.phone||null,email:r.email||null,organization:r.organization||null
      })});
      trainee=rows?.[0];if(!trainee?.id)throw Error("تعذر إنشاء سجل المتدرب.");
    }
    const saved=await http("/rest/v1/registration_requests?id=eq."+encodeURIComponent(r.id)+"&trainee_id=is.null",{
      method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({trainee_id:trainee.id})
    });
    if(!saved?.length)throw Error("لم يتم ربط الطلب؛ قد يكون تم تحديثه من مستخدم آخر.");
    $("requestDialog").close();await listData();showScreen("requests");
    setNotice("تم ربط الطلب بملف المتدرب "+trainee.full_name+".");
  }catch(error){$("requestDetailsMessage").textContent="تعذر الربط: "+error.message;await listData()}
  finally{button.disabled=false}
}
function renderAll(){renderDashboard();renderCourses();renderRequests();renderTrainees()}
function showScreen(next){
  if(["dashboard","courses","requests","trainees"].includes(next)){screen=next}
  else{screen="placeholder";$("placeholderTitle").textContent={
    trainees:"المتدربون",certificates:"الشهادات",staff:"الموظفون",departments:"الأقسام",
    projects:"أعمال ومشاريع الشركة",news:"الأخبار والفعاليات",banners:"البنرات والمحتوى",
    notifications:"الإشعارات",reports:"التقارير والإحصائيات",settings:"إعدادات النظام"
  }[next]||"القسم"}
  ["dashboard","courses","requests","trainees","placeholder"].forEach(id=>$(id+"Screen").classList.toggle("hidden",id!==screen));
  document.querySelectorAll(".nav-item").forEach(node=>node.classList.toggle("active",node.dataset.screen===next));
  $("sidebar").classList.remove("open");$("sideBackdrop").classList.remove("open");
  window.scrollTo({top:0,behavior:"auto"});
}
function openCourse(id=null){
  if(PREVIEW){setNotice("وضع المعاينة لا يسمح بتغيير البيانات. يتطلب الحفظ حساب إدارة مخوّلاً.");return}
  editingId=id;const form=$("courseForm");form.reset();resetCourseCover();$("formMessage").textContent="";
  const c=courses.find(row=>String(row.id)===String(id));
  $("saveCourse").textContent=c?"حفظ التعديلات":"حفظ المسودة";
  form.elements.namedItem("slug").dataset.manual=c?"1":"";
  const o=c?offeringFor(c.id):null;
  $("dialogTitle").textContent=c?"تعديل الدورة التدريبية":"إضافة دورة تدريبية";
  const fieldMap={title_ar:c?.title_ar,title_en:c?.title_en,slug:c?.slug,short_description_ar:c?.short_description_ar,outline_ar:c?.outline_ar,cover_image_url:c?.cover_image_url,certificate_type:c?.certificate_type||"sana_al_amar",training_year:o?.training_year||new Date().getFullYear(),delivery_mode:o?.delivery_mode||"in_person",duration_days:o?.duration_days,duration_hours:o?.duration_hours,seat_capacity:o?.seat_capacity,target_audience_ar:o?.target_audience_ar,audience_scope:o?.audience_scope||"individual"};
  Object.entries(fieldMap).forEach(([key,val])=>{if(form.elements.namedItem(key))form.elements.namedItem(key).value=val??""});
  form.elements.namedItem("is_featured").checked=!!c?.is_featured;
  previewCourseCover(text(c?.cover_image_url));
  $("courseDialog").showModal();
}
async function submitCourse(event){
  event.preventDefault();
  if(PREVIEW)return;
  const form=$("courseForm"), f=new FormData(form), value=k=>text(f.get(k));
  const title=value("title_ar"),slug=slugify(value("slug")),year=Number(value("training_year"));
  const cover=value("cover_image_url");
  if(!title||!slug||year<2000||year>2100){$("formMessage").textContent="أكمل اسم الدورة والرابط والسنة بشكل صحيح";return}
  if(cover&&!imgSrc(cover)){$("formMessage").textContent="رابط الغلاف يجب أن يبدأ بـ https://";return}
  const courseData={title_ar:title,title_en:value("title_en")||null,slug,short_description_ar:value("short_description_ar")||null,outline_ar:value("outline_ar")||null,certificate_type:value("certificate_type"),cover_image_url:cover||null,is_featured:f.has("is_featured")};
  const offeringData={training_year:year,delivery_mode:value("delivery_mode"),duration_days:intOrNull(value("duration_days")),duration_hours:intOrNull(value("duration_hours")),seat_capacity:intOrNull(value("seat_capacity")),target_audience_ar:value("target_audience_ar")||null,audience_scope:value("audience_scope")};
  const saveButton=$("saveCourse");saveButton.disabled=true;$("formMessage").textContent="جارٍ الحفظ...";
  try{
    if(pendingCourseCover){
      $("formMessage").textContent="جارٍ رفع صورة الغلاف...";
      courseData.cover_image_url=await uploadCourseCover(pendingCourseCover);
    }
    $("formMessage").textContent="جارٍ حفظ الدورة...";
    let saved;
    if(editingId){
      const rows=await http("/rest/v1/courses?id=eq."+encodeURIComponent(editingId),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(courseData)});saved=rows?.[0];
    }else{
      const rows=await http("/rest/v1/courses",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({...courseData,is_published:false})});saved=rows?.[0];
    }
    if(!saved?.id)throw new Error("لم يرجع معرّف الدورة بعد الحفظ");
    const pastOffering=offerings.find(o=>String(o.course_id)===String(saved.id)&&Number(o.training_year)===year);
    await http("/rest/v1/course_year_offerings?on_conflict=course_id%2Ctraining_year",{
      method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({...offeringData,course_id:saved.id,is_published:pastOffering?.is_published||false})
    });
    $("courseDialog").close();resetCourseCover();await listData();
    showScreen("courses");setNotice("تم حفظ بيانات الدورة وصورة الغلاف إن تم اختيارها. لا تتغير حالة النشر تلقائياً.");
  }catch(error){$("formMessage").textContent="تعذّر حفظ الدورة: "+error.message}
  finally{saveButton.disabled=false}
}
async function setPublished(id){
  if(PREVIEW){setNotice("المعاينة للعرض فقط، ولا تغيّر بيانات Supabase.");return}
  const course=courses.find(c=>String(c.id)===String(id));if(!course)return;
  if(course.is_archived){setNotice("استرجع الدورة من الأرشيف أولاً قبل نشرها.",true);return}
  const isPublishing=!course.is_published,offering=offeringFor(course.id);
  if(isPublishing&&!offering){openCourse(course.id);$("formMessage").textContent="حدد سنة التدريب وتفاصيلها ثم احفظ قبل النشر";return}
  if(!window.confirm(isPublishing?"نشر هذه الدورة الآن في التطبيق العام؟":"إلغاء نشر الدورة وإخفاؤها عن التطبيق العام؟"))return;
  try{
    await http("/rest/v1/rpc/sana_set_course_publication",{
      method:"POST",body:JSON.stringify({p_course_id:course.id,p_is_published:isPublishing,p_offering_id:isPublishing?offering.id:null})
    });
    await listData();setNotice(isPublishing?"تم نشر الدورة بنجاح.":"تم إلغاء نشر الدورة وإخفاؤها عن العامة.");
  }catch(error){setNotice("تعذر تغيير النشر: "+error.message,true)}
}
async function deleteDraft(id){
  if(PREVIEW||currentUser?.app_metadata?.sana_role!=="admin"){
    setNotice("حذف المسودات متاح للمدير فقط.",true);return;
  }
  const key=String(id),course=courses.find(c=>String(c.id)===key);
  if(!course||course.is_published||course.is_archived){
    setNotice("يمكن حذف المسودات النشطة غير المنشورة فقط.",true);return;
  }
  if(hasProtectedRecords(key)){
    setNotice("هذه الدورة مرتبطة بشهادات أو سجلات أخرى. استخدم «أرشفة» بدلاً من حذفها.",true);renderCourses();return;
  }
  if(pendingDraftDeletes.has(key))return;
  if(!window.confirm('حذف مسودة "'+course.title_ar+'"؟\\nيمكنك التراجع خلال 10 ثوانٍ، وبعدها يتم الحذف النهائي.'))return;
  const item={course,deadline:Date.now()+10000,state:"undoable",timer:null};
  pendingDraftDeletes.set(key,item);
  item.timer=setTimeout(()=>void commitDraftDelete(key),10000);
  renderAll();renderUndoStack();refreshDraftUndoTicker();
}
async function commitDraftDelete(id){
  const key=String(id),item=pendingDraftDeletes.get(key);
  if(!item||item.state!=="undoable")return;
  item.state="deleting";clearTimeout(item.timer);renderUndoStack();
  try{
    const deleted=await http("/rest/v1/courses?id=eq."+encodeURIComponent(key)+"&is_published=eq.false",{
      method:"DELETE",headers:{Prefer:"return=representation"}
    });
    if(!Array.isArray(deleted)||deleted.length!==1)throw new Error("لم تُحذف المسودة؛ تحقق من الصلاحية وحالة الدورة.");
    courses=courses.filter(c=>String(c.id)!==key);
    pendingDraftDeletes.delete(key);
    refreshDraftUndoTicker();renderUndoStack();
    await listData();renderAll();
    setNotice("تم حذف مسودة الدورة نهائياً: "+item.course.title_ar);
  }catch(error){
    pendingDraftDeletes.delete(key);refreshDraftUndoTicker();renderUndoStack();
    await listData();renderAll();
    const related=String(error.message).includes("Course has related publication or activity records");
    setNotice(related?"أُوقف الحذف لأن الدورة أصبحت مرتبطة بسجلات محفوظة. استخدم زر «أرشفة» بدلاً من الحذف.":"تعذر حذف المسودة: "+error.message,true);
  }
}
async function archiveCourse(id){
  if(PREVIEW||currentUser?.app_metadata?.sana_role!=="admin"){
    setNotice("الأرشفة متاحة للمدير فقط.",true);return;
  }
  const course=courses.find(c=>String(c.id)===String(id));
  if(!course||course.is_published||course.is_archived)return;
  if(!window.confirm('أرشفة دورة "'+course.title_ar+'"؟ ستُخفى من الدورات النشطة مع الاحتفاظ بجميع السجلات والشهادات.'))return;
  try{
    const saved=await http("/rest/v1/courses?id=eq."+encodeURIComponent(id)+"&is_published=eq.false&is_archived=eq.false",{
      method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({is_archived:true})
    });
    if(!Array.isArray(saved)||saved.length!==1)throw Error("لم تتغير حالة الدورة؛ حدّث القائمة وأعد المحاولة.");
    await listData();showScreen("courses");
    setNotice("تمت أرشفة الدورة وحفظ سجلاتها. تجدها ضمن فلتر «المؤرشفة».");
  }catch(error){await listData();setNotice("تعذرت الأرشفة: "+error.message,true)}
}
async function restoreArchivedCourse(id){
  if(PREVIEW||currentUser?.app_metadata?.sana_role!=="admin"){
    setNotice("استرجاع الدورات متاح للمدير فقط.",true);return;
  }
  const course=courses.find(c=>String(c.id)===String(id));
  if(!course||!course.is_archived)return;
  try{
    const saved=await http("/rest/v1/courses?id=eq."+encodeURIComponent(id)+"&is_archived=eq.true&is_published=eq.false",{
      method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({is_archived:false})
    });
    if(!Array.isArray(saved)||saved.length!==1)throw Error("لم تتغير حالة الدورة؛ حدّث القائمة وأعد المحاولة.");
    $("courseFilter").value="all";
    await listData();showScreen("courses");
    setNotice("تم استرجاع الدورة إلى المسودات، وما اننشرت تلقائياً.");
  }catch(error){await listData();setNotice("تعذر استرجاع الدورة: "+error.message,true)}
}
async function updateRequest(id,status){
  if(PREVIEW)return;
  if(!Object.hasOwn(stateLabels,status)){setNotice("حالة الطلب غير معروفة.",true);return}
  const request=registrations.find(x=>String(x.id)===String(id));if(!request)return;
  try{
    const data={status};
    if(status==="contacted"&&!request.contacted_at)data.contacted_at=new Date().toISOString();
    await http("/rest/v1/registration_requests?id=eq."+encodeURIComponent(id),{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(data)
    });
    await listData();setNotice("تم تحديث حالة طلب التسجيل.");
  }catch(error){setNotice("تعذر تعديل حالة الطلب: "+error.message,true);await listData();}
}
async function logout(){
  cancelPendingOnLogout();
  const token=session?.access_token;
  if(token&&!PREVIEW){
    try{
      await fetch(CONFIG.url+"/auth/v1/logout",{
        method:"POST",headers:{apikey:CONFIG.publishableKey,Authorization:"Bearer "+token}
      });
    }catch{ /* Always clear the local session even when offline. */ }
  }
  session=null;currentUser=null;sessionStorage.removeItem(AUTH_KEY);
  location.href=location.pathname;
}
function bindUI(){
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const button=$("loginButton");button.disabled=true;loginMessage("جارٍ التحقق...");
    try{await signIn($("email").value.trim(),$("password").value);loginMessage("");showApp();await listData()}
    catch(error){loginMessage(error.message);session=null;sessionStorage.removeItem(AUTH_KEY)}
    finally{button.disabled=false}
  });
  $("logoutButton").addEventListener("click",logout);
  $("menuToggle").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("sideBackdrop").classList.toggle("open")});
  $("sideBackdrop").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("sideBackdrop").classList.remove("open")});
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
  document.querySelectorAll("[data-switch]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.switch)));
  $("addCourse").addEventListener("click",()=>openCourse());
  $("reloadCourses").addEventListener("click",listData);
  $("courseSearch").addEventListener("input",renderCourses);
  $("courseFilter").addEventListener("change",renderCourses);
  $("globalSearch").addEventListener("input",()=>{showScreen("courses");renderCourses()});
  $("courseList").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit]"),publish=e.target.closest("[data-publish]"),remove=e.target.closest("[data-delete]"),archive=e.target.closest("[data-archive]"),restore=e.target.closest("[data-restore]");
    if(edit)openCourse(edit.dataset.edit);else if(publish)setPublished(publish.dataset.publish);else if(remove)deleteDraft(remove.dataset.delete);else if(archive)archiveCourse(archive.dataset.archive);else if(restore)restoreArchivedCourse(restore.dataset.restore);
  });
  $("draftUndoStack").addEventListener("click",e=>{
    const undo=e.target.closest("[data-undo]");
    if(undo)undoDraftDelete(undo.dataset.undo);
  });
  $("courseForm").addEventListener("submit",submitCourse);
  $("closeDialog").addEventListener("click",()=>{$("courseDialog").close();resetCourseCover()});
  $("cancelDialog").addEventListener("click",()=>{$("courseDialog").close();resetCourseCover()});
  $("courseCoverFile").addEventListener("change",onCourseCoverFile);
  $("courseForm").elements.namedItem("cover_image_url").addEventListener("input",e=>{
    if(pendingCourseCover)resetCourseCover();
    previewCourseCover(text(e.target.value));
  });
  $("courseForm").elements.namedItem("title_ar").addEventListener("input",e=>{
    const slug=$("courseForm").elements.namedItem("slug");if(!editingId&&!slug.dataset.manual)slug.value=slugify(e.target.value);
  });
  $("courseForm").elements.namedItem("slug").addEventListener("input",e=>e.target.dataset.manual="1");
  $("requestRows").addEventListener("change",e=>{if(e.target.matches(".request-status"))updateRequest(e.target.dataset.request,e.target.value)});
  $("requestRows").addEventListener("click",e=>{const b=e.target.closest("[data-request-detail]");if(b)openRequestDetails(b.dataset.requestDetail)});
  $("requestSearch").addEventListener("input",renderRequests);
  $("requestFilter").addEventListener("change",renderRequests);
  $("reloadRequests").addEventListener("click",listData);
  $("traineeSearch").addEventListener("input",renderTrainees);
  $("reloadTrainees").addEventListener("click",listData);
  $("addTrainee").addEventListener("click",()=>openTrainee());
  $("traineeRows").addEventListener("click",e=>{const b=e.target.closest("[data-trainee-edit]");if(b)openTrainee(b.dataset.traineeEdit)});
  $("traineeForm").addEventListener("submit",saveTrainee);
  $("closeTraineeDialog").addEventListener("click",()=>$("traineeDialog").close());
  $("cancelTraineeDialog").addEventListener("click",()=>$("traineeDialog").close());
  $("closeRequestDialog").addEventListener("click",()=>$("requestDialog").close());
  $("dismissRequestDialog").addEventListener("click",()=>$("requestDialog").close());
  $("approveTraineeButton").addEventListener("click",e=>approveRequestTrainee(e.currentTarget.dataset.requestId));
}
async function boot(){
  bindUI();
  if(PREVIEW){showApp();await listData();setNotice("هذه معاينة تصميم فقط: البيانات افتراضية، ولن يُرسل أي طلب إلى Supabase.");return}
  const ok=await authenticateSaved();
  if(ok){showApp();await listData()}
}
boot().catch(error=>setNotice("حصل خطأ أثناء تشغيل لوحة الإدارة: "+error.message,true));
