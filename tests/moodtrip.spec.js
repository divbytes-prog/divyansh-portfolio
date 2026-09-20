import{test,expect}from'@playwright/test';

const places=[
  ['Test Cafe','cafe',26.8508,81.0104],
  ['Green Park','park',26.8520,81.0112],
  ['Fun Arcade','arcade',26.8530,81.0094],
  ['City Restaurant','restaurant',26.8540,81.0120],
  ['Cinema One','cinema',26.8550,81.0130],
  ['Local Mall','mall',26.8560,81.0140]
];

test.beforeEach(async({page})=>{
  await page.route('**/api/feedback**',async route=>{
    if(route.request().method()==='POST'){
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({stored:true,storage:'supabase',configured:true})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({storage:'supabase',configured:true,feedback:{},rows:0})});
  });

  await page.route('**/api/moodtrip**',async route=>{
    const url=new URL(route.request().url());
    const action=url.searchParams.get('action');
    let body={};
    if(action==='suggest')body={items:[]};
    else if(action==='geocode')body={lat:26.85,lng:81.01,label:'Test City'};
    else if(action==='places')body={
      provider:'OpenStreetMap',
      elements:places.map(([name,category,lat,lon],i)=>({
        type:'node',id:i+1,lat,lon,
        tags:{name,...(category==='cafe'||category==='restaurant'||category==='cinema'?{amenity:category}:{leisure:category})}
      }))
    };
    else if(action==='footprint')body={footprint:null};
    else body={};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
});

test('recommendations adapt immediately to Not For Me feedback',async({page})=>{
  await page.goto('/moodtrip');

  const location=page.getByPlaceholder('Search building, society, street, locality or city');
  await location.fill('Test City');
  await page.getByRole('button',{name:'SEARCH',exact:true}).click();
  await expect(page.getByText('Test City',{exact:true}).first()).toBeVisible();

  await page.getByRole('button',{name:'FIND PLACES FOR THIS MOOD'}).click();
  await expect(page.getByText('Places that fit right now.')).toBeVisible();
  await expect(page.getByText('EXPLAINABLE AI / SELECTED PLACE')).toBeVisible();

  const reject=page.getByRole('button',{name:'NOT FOR ME −'}).first();
  await reject.click();
  await expect(page.getByRole('button',{name:'NOT FOR ME ✓'}).first()).toBeVisible();
});

test('ML evaluation lab is present and transparent about benchmark scope',async({page})=>{
  await page.goto('/moodtrip');
  await page.locator('#ml-benchmark').scrollIntoViewIfNeeded();
  await expect(page.getByText('05 / ML EVALUATION LAB')).toBeVisible();
  await expect(page.getByText(/controlled preference simulation/i)).toBeVisible();
  await expect(page.getByText('Production Distilled NN')).toBeVisible();
});
