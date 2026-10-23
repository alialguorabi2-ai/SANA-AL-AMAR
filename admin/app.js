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
let session=null,currentUser=null,courses=[],offerings=[],registrations=[],editingId=null,filter="";
let screen="dashboard";
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
  if(PREVIEW){courses=[sampleCourse];offerings=[];registrations=[];renderAll();return}
  try{
    const [courseRows,offeringRows,requestRows]=await Promise.all([
      http("/rest/v1/courses?select=id,title_ar,title_en,slug,short_description_ar,outline_ar,cover_image_url,certificate_type,is_featured,is_published,created_at,updated_at&order=updated_at.desc&limit=300"),
      http("/rest/v1/course_year_offerings?select=id,course_id,training_year,delivery_mode,duration_days,duration_hours,seat_capacity,target_audience_ar,audience_scope,is_published&order=training_year.desc&limit=800"),
      http("/rest/v1/registration_requests?select=id,course_id,full_name,status,created_at&order=created_at.desc&limit=300")
    ]);
    courses=courseRows||[];offerings=offeringRows||[];registrations=requestRows||[];
    setNotice("");renderAll();
  }catch(error){setNotice("تعذّر تحميل البيانات: "+error.message,true)}
}
function offeringFor(courseId){return offerings.filter(o=>String(o.course_id)===String(courseId)).sort((a,b)=>b.training_year-a.training_year)[0]}
function metric(label,value,color,ic){
  return '<div class="metric"><div><p>'+escapeHTML(label)+'</p><strong>'+escapeHTML(value)+'</strong></div><span class="metric-icon '+color+'">'+icon(ic)+'</span></div>';
}
function statusLabel(published){
  return '<span class="status-pill '+(published?"published":"draft")+'">'+(published?"منشورة":"مسودة")+'</span>';
}
function coverHTML(row){
  const src=imgSrc(row.cover_image_url);
  return '<div class="cover">'+(src?'<img src="'+escapeHTML(src)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':icon("graduation"))+'</div>';
}
function requestName(r){const c=courses.find(v=>String(v.id)===String(r.course_id));return c?.title_ar||"الدورة غير متاحة"}
function renderDashboard(){
  $("metrics").innerHTML=[
    metric("إجمالي الدورات",courses.length,"","graduation"),
    metric("الدورات المنشورة",courses.filter(x=>x.is_published).length,"green","book"),
    metric("مسودات الدورات",courses.filter(x=>!x.is_published).length,"orange","edit"),
    metric("طلبات بانتظار المراجعة",registrations.filter(x=>x.status==="new").length,"red","requests")
  ].join("");
  const latest=courses.slice(0,3);
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
  const filtered=courses.filter(c=>(selected==="all"||(selected==="published"&&c.is_published)||(selected==="draft"&&!c.is_published))&&
    [c.title_ar,c.title_en,c.slug].some(v=>text(v).toLocaleLowerCase().includes(term)));
  $("courseList").innerHTML=filtered.length?filtered.map(c=>{
    const o=offeringFor(c.id);
    return '<article class="course-card">'+coverHTML(c)+'<div class="course-info"><div style="display:flex;justify-content:space-between;align-items:center">'+statusLabel(c.is_published)+'<small style="color:#70889a">'+escapeHTML(o?.training_year||"بدون سنة")+'</small></div><h3>'+escapeHTML(c.title_ar)+'</h3><p>'+escapeHTML(c.short_description_ar||"أضف نبذة مختصرة عن الدورة من لوحة التعديل")+'</p><div class="course-meta"><span>▣ '+escapeHTML(o?.duration_days?o.duration_days+" أيام":"المدة غير محددة")+'</span><span>◉ '+escapeHTML(o?.delivery_mode==="online"?"أونلاين":o?.delivery_mode==="hybrid"?"مدمج":o?.delivery_mode?"حضوري":"غير محدد")+'</span><span>♙ '+escapeHTML(o?.seat_capacity?"المقاعد "+o.seat_capacity:"المقاعد غير محددة")+'</span></div><div class="card-foot"><button class="btn btn-outline" data-edit="'+escapeHTML(c.id)+'">'+icon("edit")+' تعديل</button><button class="btn '+(c.is_published?"btn-outline":"btn-primary")+'" data-publish="'+escapeHTML(c.id)+'">'+(c.is_published?"إلغاء النشر":"نشر الدورة")+'</button></div></div></article>';
  }).join(""):empty("ماكو دورات تطابق البحث أو الفلتر");
  if(PREVIEW)$("addCourse").disabled=true;
}
function renderRequests(){
  const options=Object.entries(stateLabels).map(([key,name])=>'<option value="'+escapeHTML(key)+'">'+escapeHTML(name)+'</option>').join("");
  $("requestRows").innerHTML=registrations.length?registrations.map(r=>
    '<tr><td>'+escapeHTML(r.id)+'</td><td>'+escapeHTML(r.full_name)+'</td><td>'+escapeHTML(requestName(r))+'</td><td>'+escapeHTML(dateLabel(r.created_at))+'</td><td><select class="request-status" data-request="'+escapeHTML(r.id)+'" '+(PREVIEW?"disabled":"")+'>'+options.replace('value="'+escapeHTML(r.status)+'"','value="'+escapeHTML(r.status)+'" selected')+'</select></td></tr>'
  ).join(""):'<tr><td colspan="5" style="text-align:center;padding:36px;color:#789">ماكو طلبات تسجيل حالياً</td></tr>';
}
function renderAll(){renderDashboard();renderCourses();renderRequests()}
function showScreen(next){
  if(["dashboard","courses","requests"].includes(next)){screen=next}
  else{screen="placeholder";$("placeholderTitle").textContent={
    trainees:"المتدربون",certificates:"الشهادات",staff:"الموظفون",departments:"الأقسام",
    projects:"أعمال ومشاريع الشركة",news:"الأخبار والفعاليات",banners:"البنرات والمحتوى",
    notifications:"الإشعارات",reports:"التقارير والإحصائيات",settings:"إعدادات النظام"
  }[next]||"القسم"}
  ["dashboard","courses","requests","placeholder"].forEach(id=>$(id+"Screen").classList.toggle("hidden",id!==screen));
  document.querySelectorAll(".nav-item").forEach(node=>node.classList.toggle("active",node.dataset.screen===next));
  $("sidebar").classList.remove("open");$("sideBackdrop").classList.remove("open");
  window.scrollTo({top:0,behavior:"auto"});
}
function openCourse(id=null){
  if(PREVIEW){setNotice("وضع المعاينة لا يسمح بتغيير البيانات. يتطلب الحفظ حساب إدارة مخوّلاً.");return}
  editingId=id;const form=$("courseForm");form.reset();$("formMessage").textContent="";
  const c=courses.find(row=>String(row.id)===String(id));
  const o=c?offeringFor(c.id):null;
  $("dialogTitle").textContent=c?"تعديل الدورة التدريبية":"إضافة دورة تدريبية";
  const fieldMap={title_ar:c?.title_ar,title_en:c?.title_en,slug:c?.slug,short_description_ar:c?.short_description_ar,outline_ar:c?.outline_ar,cover_image_url:c?.cover_image_url,certificate_type:c?.certificate_type||"sana_al_amar",training_year:o?.training_year||new Date().getFullYear(),delivery_mode:o?.delivery_mode||"in_person",duration_days:o?.duration_days,duration_hours:o?.duration_hours,seat_capacity:o?.seat_capacity,target_audience_ar:o?.target_audience_ar,audience_scope:o?.audience_scope||"individual"};
  Object.entries(fieldMap).forEach(([key,val])=>{if(form.elements.namedItem(key))form.elements.namedItem(key).value=val??""});
  form.elements.namedItem("is_featured").checked=!!c?.is_featured;
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
    $("courseDialog").close();await listData();
    showScreen("courses");setNotice("تم حفظ بيانات الدورة. تبقى المسودة مخفية عن المستخدمين لحين نشرها.");
  }catch(error){$("formMessage").textContent="تعذّر حفظ الدورة: "+error.message}
  finally{saveButton.disabled=false}
}
async function setPublished(id){
  if(PREVIEW){setNotice("المعاينة للعرض فقط، ولا تغيّر بيانات Supabase.");return}
  const course=courses.find(c=>String(c.id)===String(id));if(!course)return;
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
async function updateRequest(id,status){
  if(PREVIEW)return;
  try{
    await http("/rest/v1/registration_requests?id=eq."+encodeURIComponent(id),{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status})
    });
    await listData();setNotice("تم تحديث حالة طلب التسجيل.");
  }catch(error){setNotice("تعذر تعديل حالة الطلب: "+error.message,true);await listData();}
}
function logout(){
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
    const edit=e.target.closest("[data-edit]"),publish=e.target.closest("[data-publish]");
    if(edit)openCourse(edit.dataset.edit);else if(publish)setPublished(publish.dataset.publish);
  });
  $("courseForm").addEventListener("submit",submitCourse);
  $("closeDialog").addEventListener("click",()=>$("courseDialog").close());
  $("cancelDialog").addEventListener("click",()=>$("courseDialog").close());
  $("courseForm").elements.namedItem("title_ar").addEventListener("input",e=>{
    const slug=$("courseForm").elements.namedItem("slug");if(!editingId&&!slug.dataset.manual)slug.value=slugify(e.target.value);
  });
  $("courseForm").elements.namedItem("slug").addEventListener("input",e=>e.target.dataset.manual="1");
  $("requestRows").addEventListener("change",e=>{if(e.target.matches(".request-status"))updateRequest(e.target.dataset.request,e.target.value)});
}
async function boot(){
  bindUI();
  if(PREVIEW){showApp();await listData();setNotice("هذه معاينة تصميم فقط: البيانات افتراضية، ولن يُرسل أي طلب إلى Supabase.");return}
  const ok=await authenticateSaved();
  if(ok){showApp();await listData()}
}
boot().catch(error=>setNotice("حصل خطأ أثناء تشغيل لوحة الإدارة: "+error.message,true));
