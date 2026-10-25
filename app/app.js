(()=>{
"use strict";
const root="https://sseugkalnlclovwhxiys.supabase.co/rest/v1/";
const key="sb_publishable_NPfWrDpXNNlob6YzG0EGJg_KRFDmz0O";
const preview=new URLSearchParams(location.search).get("preview")==="1";
const refinery="./reference/plant.jpg";
const training="./reference/training.jpg";
const inspection="./reference/inspection.jpg";
const samples=[
{id:-1,title_ar:"تشغيل محطات عزل النفط والغاز",short_description_ar:"التدريب على تشغيل معدات فصل النفط والغاز وإجراءات السلامة.",outline_ar:"مكونات محطات العزل\nمبادئ تشغيل الفواصل\nمراقبة المتغيرات التشغيلية\nالسلامة والاستجابة للطوارئ",certificate_summary_ar:"شهادة مشاركة بعد استيفاء متطلبات البرنامج",certificate_benefits_ar:"إثبات المشاركة والتطوير المهني",cover_image_url:refinery,is_featured:true,sort_order:1,sample_date:"15 Nov 2026"},
{id:-2,title_ar:"أساسيات الحفر",short_description_ar:"مقدمة في عمليات الحفر ومعداته.",outline_ar:"منظومة الحفر\nمعدات الحفارة\nأساسيات سوائل الحفر\nالسلامة المهنية",cover_image_url:training,is_featured:true,sort_order:2,sample_date:"01 Dec 2026"},
{id:-3,title_ar:"الفحص البصري (VT) – المستوى الثاني",short_description_ar:"مبادئ الفحص البصري وتوثيق نتائج الفحص.",outline_ar:"أساسيات VT\nالعيوب الشائعة\nإعداد تقارير الفحص",cover_image_url:inspection,is_featured:false,sort_order:3,sample_date:"10 Sep 2026"}
];
const sampleOffers=samples.map(x=>({course_id:x.id,duration_days:5,duration_hours:30,delivery_mode:"in_person",target_audience_ar:"مشغلو المحطات\nالمهندسون والفنيون\nخريجو الهندسة"}));
let courses=[],offers=[],media=[],certs=[],reviews=[],active=null,detailTab="about",mineTab="new",page="home";
const $=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=s=>{try{let u=new URL(s,location.href);return u.protocol==="https:"?u.href:""}catch(_){return""}};
const pic=(item,alt="",cls="")=>'<img class="'+cls+'" src="'+escape(safeUrl(item.cover_image_url)||"../assets/sana-logo.png")+'" alt="'+escape(alt)+'" loading="lazy">';
const offer=id=>offers.find(x=>String(x.course_id)===String(id));
const symbol=(name,cls="")=>'<svg class="'+cls+'"><use href="#'+name+'"/></svg>';
function courseCard(item){
return '<article class="course-card"><div class="course-image">'+pic(item,item.title_ar)+'</div><div class="course-body"><h3>'+escape(item.title_ar)+'</h3><div class="course-date">'+symbol("i-calendar")+escape(item.sample_date||"الموعد يعلن لاحقاً")+'</div><button type="button" data-course="'+escape(item.id)+'">تفاصيل الدورة ←</button></div></article>';
}
function empty(title,desc=""){
return '<div class="card-empty"><strong>'+escape(title)+'</strong>'+escape(desc)+'</div>';
}
function renderCourses(){
const t=($("courseSearch").value||"").trim().toLowerCase();
const filtered=courses.filter(c=>([c.title_ar,c.title_en,c.short_description_ar].join(" ").toLowerCase().includes(t)));
$("courseList").innerHTML=filtered.map(c=>'<button class="list-course" data-course="'+escape(c.id)+'">'+pic(c,c.title_ar)+'<span class="list-copy"><strong>'+escape(c.title_ar)+'</strong><p>'+escape(c.short_description_ar||"عرض نبذة ومحاور الدورة")+'</p><span class="action-link">تفاصيل الدورة ←</span></span></button>').join("")||empty(t?"لا توجد دورة تطابق البحث":"لا توجد دورات منشورة حالياً","بعد نشر الدورات من لوحة الإدارة ستظهر هنا.");
const upcoming=courses.filter(c=>c.is_featured);
$("homeCourses").innerHTML=(upcoming.length?upcoming:courses).slice(0,4).map(courseCard).join("")||(
'<article class="course-card empty-preview"><div class="course-image"><img src="'+escape(refinery)+'" alt="منشأة نفط وغاز" loading="lazy"></div><div class="course-body"><h3>برامج التدريب في النفط والغاز</h3><div class="course-date">'+symbol("i-calendar")+'بانتظار الإعلان الرسمي</div><button type="button" data-go="courses">استكشف الدورات ←</button></div></article>'+
'<article class="course-card empty-preview"><div class="course-image"><img src="'+escape(training)+'" alt="التدريب الهندسي" loading="lazy"></div><div class="course-body"><h3>برامج التطوير المهني</h3><div class="course-date">'+symbol("i-calendar")+'بانتظار النشر</div><button type="button" data-go="sections">تصفح الأقسام ←</button></div></article>'+
'<p class="empty-disclaimer">بطاقات تعريفية بالمجالات، وليست دورات مجدولة. تظهر الدورات الفعلية هنا بعد نشرها من الإدارة.</p>'
);
}
function isRegOpen(c){return !preview && !!offer(c.id)}
function tabs(){return [["about","نبذة"],["topics","المحاور"],["certificate","الشهادة"],["photos","الصور"],["reviews","التقييمات"]].map(([id,label])=>'<button data-tab="'+id+'" class="'+(detailTab===id?"active":"")+'" role="tab" aria-selected="'+(detailTab===id?"true":"false")+'">'+label+'</button>').join("")}
function certificate(c){
const data=certs.filter(v=>String(v.course_id)===String(c.id));
const sample=preview?'<div class="certificate-preview"><img src="../assets/sana-logo.png" alt="شعار الشركة"><b>TRAINING CERTIFICATE</b><small>تصميم توضيحي للشهادة - غير صالح كإثبات</small></div>':"";
const box=data.map(v=>'<div class="info-lines"><div><strong>الشهادة</strong><span>'+escape(v.title_ar)+'</span></div><div><strong>الجهة المصدرة</strong><span>'+escape(v.issuing_body||"غير محددة")+'</span></div>'+(safeUrl(v.sample_file_url)?'<div><a href="'+escape(safeUrl(v.sample_file_url))+'" target="_blank" rel="noopener noreferrer">عرض نموذج الشهادة</a></div>':"")+'</div>').join("");
return '<h2>الشهادة المكتسبة</h2>'+sample+box+'<div class="info-lines"><div><strong>نوع الشهادة</strong><span>'+escape(c.certificate_summary_ar||"يحدد عند اعتماد البرنامج")+'</span></div><div><strong>فوائد الشهادة</strong><span>'+escape(c.certificate_benefits_ar||"يحدد حسب الدورة")+'</span></div></div>';
}
function photos(c){
let list=media.filter(v=>String(v.course_id)===String(c.id)&&safeUrl(v.file_url)).map(v=>({url:v.file_url,caption:v.caption_ar||"صورة من الدورة"}));
if(preview)list=["./reference/group.jpg","./reference/seminar.jpg","./reference/industrial.jpg","./reference/classroom.jpg","./reference/team.jpg","./reference/staff.jpg"].map((url,i)=>({url,caption:"صورة توضيحية "+(i+1)}));
return '<h2>صور من الدورة السابقة</h2>'+(list.length?'<div class="photo-grid">'+list.map(v=>'<img alt="'+escape(v.caption)+'" src="'+escape(safeUrl(v.url))+'" loading="lazy">').join("")+'</div>':empty("لا توجد صور منشورة لهذه الدورة"));
}
function ratings(c){
const data=preview?[{trainee_name:"أحمد محمد",rating:5,review_ar:"دورة ممتازة ومفيدة جداً، الشرح منظم.",date:"2026-08-12"},{trainee_name:"سارة علي",rating:5,review_ar:"معلومات عملية وتطبيقية، أنصح بها.",date:"2026-07-25"},{trainee_name:"حسين كاظم",rating:4,review_ar:"تنظيم جيد ودعم من فريق التدريب.",date:"2026-06-10"}]:reviews.filter(r=>String(r.course_id)===String(c.id));
if(!data.length)return '<h2>التقييمات</h2>'+empty("لا توجد تقييمات منشورة حالياً");
const avg=(data.reduce((n,v)=>n+(Number(v.rating)||0),0)/data.length).toFixed(1);
return '<div class="rating-summary"><b>'+escape(avg)+'</b><div><div class="stars">★★★★★</div><small>('+data.length+' تقييم)</small></div></div>'+data.map(r=>'<div class="review"><div class="avatar">'+symbol("i-user")+'</div><div class="review-main"><div class="review-header"><strong>'+escape(r.trainee_name||"متدرب")+'</strong><time>'+escape(r.date||"")+'</time></div><div class="stars">'+("★".repeat(Math.max(1,Math.min(5,Number(r.rating)||1))))+'</div><p>'+escape(r.review_ar||"")+'</p></div></div>').join("");
}
function detailsContent(c){
const off=offer(c.id);
if(detailTab==="about")return '<h2>نبذة عن الدورة</h2><p>'+escape(c.short_description_ar||"لم تُنشر نبذة هذه الدورة بعد.")+'</p><h2>الفئة المستهدفة</h2>'+(off&&off.target_audience_ar?'<ul>'+off.target_audience_ar.split(/\n|،|;/).filter(Boolean).map(x=>'<li>'+escape(x.trim())+'</li>').join("")+'</ul>':empty("لم تُنشر الفئة المستهدفة بعد"));
if(detailTab==="topics")return '<h2>محاور الدورة</h2><p>'+escape(c.outline_ar||"لم تُنشر محاور هذه الدورة بعد.")+'</p>';
if(detailTab==="certificate")return certificate(c);
if(detailTab==="photos")return photos(c);
return ratings(c);
}
function renderDetails(){
if(!active)return;
const off=offer(active.id);
const days=off&&off.duration_days?off.duration_days+" أيام":"المدة لاحقاً";
const mode=off?(off.delivery_mode==="online"?"أونلاين":off.delivery_mode==="hybrid"?"هجين":"حضوري"):"يحدد لاحقاً";
$("courseDetails").innerHTML=pic(active,active.title_ar,"detail-photo")+'<h1 class="detail-title">'+escape(active.title_ar)+'</h1><div class="detail-meta"><span>'+symbol("i-calendar")+escape(days)+'</span><span>'+symbol("i-pin")+escape(mode)+'</span><span>'+symbol("i-bars","level-icon")+'متوسط</span></div>'+(isRegOpen(active)?'<a class="register" style="display:block;text-align:center" href="../register.html?course_id='+encodeURIComponent(active.id)+'">أرغب بالتسجيل</a>':'<button class="register" disabled>'+(preview?"زر تسجيل توضيحي":"التسجيل غير مفتوح حالياً")+'</button>')+'<div class="detail-tabs" role="tablist">'+tabs()+'</div><div class="detail-content">'+detailsContent(active)+'</div>';
}
function renderMine(){
document.querySelectorAll(".mine-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.status===mineTab));
const statuses={new:"قيد المراجعة",confirmed:"مؤكدة",completed:"مكتملة"};
if(!preview){$("mineList").innerHTML=empty("لا توجد بيانات معروضة","هذه الصفحة ستعرض تسجيلاتك بعد تفعيل حساب المتدرب والتحقق من الهوية، حفاظاً على خصوصية الطلبات.");return}
const sel=mineTab==="new"?[samples[0]]:mineTab==="confirmed"?[samples[1]]:[samples[2]];
$("mineList").innerHTML=sel.map(c=>'<div class="mine-card">'+pic(c,c.title_ar)+'<div><strong>'+escape(c.title_ar)+'</strong><span class="status '+mineTab+'">'+statuses[mineTab]+'</span><div class="meta">'+symbol("i-calendar")+escape(c.sample_date)+'</div></div></div>').join("");
}
function go(next){
if(!$("page-"+next))next="home";page=next;
document.querySelectorAll(".screen").forEach(v=>v.classList.toggle("active",v.id==="page-"+next));
const titles={home:"",sections:"الأقسام",courses:"الدورات التدريبية",details:"تفاصيل الدورة",mine:"دوراتي",account:"حسابي",inspection:"الفحص الهندسي",projects:"أعمال ومشاريع الشركة",news:"الأخبار والفعاليات"};
const main=next==="home", canBack=["details","courses","inspection","projects","news"].includes(next);
$("headerLogo").classList.toggle("hidden",!main);
$("headerTitle").classList.toggle("hidden",main);
$("headerTitle").textContent=titles[next]||"";
$("headerBack").classList.toggle("hidden",!canBack);
$("headerAction").classList.toggle("hidden",!["home","sections","account"].includes(next));
$("headerActionIcon").setAttribute("href",next==="sections"?"#i-search":next==="account"?"#i-gear":"#i-bell");
$("headerDot").classList.toggle("hidden",next!=="home"||!preview);
document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===next||(b.dataset.go==="sections"&&["courses","details","inspection","projects","news"].includes(next))));
if(next==="details")renderDetails();if(next==="mine")renderMine();
$("scroller").scrollTo(0,0);
history.replaceState(null,"",location.pathname+location.search+"#"+next);
}
async function read(table){
const r=await fetch(root+table,{headers:{apikey:key,Accept:"application/json"},cache:"no-store"});
if(!r.ok)throw Error("HTTP "+r.status);return r.json();
}
async function load(){
if(preview){courses=samples;offers=sampleOffers;$("previewBadge").classList.remove("hidden");$("accountName").textContent="أحمد محمد (مثال)";$("accountEmail").textContent="ahmed@example.com · بيانات توضيحية";renderCourses();return}
try{
const data=await Promise.all([read("courses?select=id,title_ar,title_en,short_description_ar,outline_ar,certificate_summary_ar,certificate_benefits_ar,cover_image_url,is_featured,sort_order&is_published=eq.true&is_archived=eq.false&order=sort_order.asc"),read("course_year_offerings?select=course_id,delivery_mode,duration_days,duration_hours,target_audience_ar&is_published=eq.true")]);
courses=data[0];offers=data[1];renderCourses();
}catch(err){$("homeCourses").innerHTML=empty("تعذّر تحميل الدورات","تحقق من الاتصال وحاول مجدداً.");$("courseList").innerHTML=empty("تعذّر تحميل الدورات");}
Promise.allSettled([read("course_media?select=course_id,file_url,caption_ar&order=sort_order.asc"),read("course_certificates?select=course_id,title_ar,issuing_body,sample_file_url"),read("course_reviews?select=course_id,trainee_name,rating,review_ar&is_published=eq.true")]).then(r=>{media=r[0].status==="fulfilled"?r[0].value:[];certs=r[1].status==="fulfilled"?r[1].value:[];reviews=r[2].status==="fulfilled"?r[2].value:[];if(page==="details")renderDetails()});
}
document.addEventListener("click",ev=>{
const el=ev.target.closest("[data-go],[data-course],[data-tab],[data-status],[data-account]");
if(!el)return;
if(el.dataset.go){ev.preventDefault();go(el.dataset.go)}
else if(el.dataset.course){active=courses.find(c=>String(c.id)===String(el.dataset.course));if(active){detailTab="about";go("details")}}
else if(el.dataset.tab){detailTab=el.dataset.tab;renderDetails()}
else if(el.dataset.status){mineTab=el.dataset.status;renderMine()}
else if(el.dataset.account){const items={profile:"البيانات الشخصية",notifications:"الإشعارات",requests:"طلباتي",certificates:"الشهادات",favorites:"المفضلة",logout:"تسجيل الخروج"};$("accountNotice").textContent=(items[el.dataset.account]||"الخدمة")+" — ستُفعّل الخدمة بعد ربط حساب المتدرب والتحقق من صلاحيات الوصول.";}
});
$("headerBack").addEventListener("click",()=>go(page==="details"?"courses":page==="courses"?"sections":"sections"));
$("headerAction").addEventListener("click",()=>{if(page==="sections")go("courses");else if(page==="home")go("account");else $("accountNotice").textContent="إعدادات الحساب ستكون متاحة بعد تفعيل حساب المتدرب."});
document.addEventListener("error",event=>{const img=event.target;if(!(img instanceof HTMLImageElement)||img.dataset.fallbackDone==="1")return;img.dataset.fallbackDone="1";img.classList.add("fallback-logo");img.src="../assets/sana-logo.png";},true);
$("courseSearch").addEventListener("input",renderCourses);
load();go(location.hash.slice(1)||"home");
})();