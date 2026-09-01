import{n as e}from"./chunk-DnJy8xQt.js";import{t}from"./jsx-runtime-BX9360Lk.js";import{n,t as r}from"./detail-highlight-card-Z-XmNq4J.js";import{n as i,t as a}from"./detail-query-boundary-BY3ddKw_.js";var o,s,c,l,u,d,f;e((()=>{n(),i(),o=t(),s={title:`Components/DetailQueryBoundary`,component:a,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`w-[min(44rem,calc(100vw-2rem))]`,children:(0,o.jsx)(e,{})})],args:{query:{data:{name:`web-01`,type:`Host`},error:null,isPending:!1},title:`Asset details`,errorTitle:`Unable to load asset`,errorDescription:`The selected asset could not be loaded.`,missingMessage:`The API did not return an asset record.`,children:e=>(0,o.jsxs)(`div`,{className:`grid gap-3 sm:grid-cols-2`,children:[(0,o.jsx)(r,{label:`Asset`,value:e.name,description:`Primary identifier used across the platform`}),(0,o.jsx)(r,{label:`Type`,value:e.type,description:`Inventory classification for this asset`})]})}},c={},l={args:{query:{data:void 0,error:null,isPending:!0}}},u={args:{query:{data:void 0,error:Error(`Asset request failed`),isPending:!1}}},d={args:{query:{data:void 0,error:null,isPending:!1}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    query: {
      data: undefined,
      error: null,
      isPending: true
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    query: {
      data: undefined,
      error: new Error("Asset request failed"),
      isPending: false
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    query: {
      data: undefined,
      error: null,
      isPending: false
    }
  }
}`,...d.parameters?.docs?.source}}},f=[`Success`,`Loading`,`ErrorState`,`MissingData`]}))();export{u as ErrorState,l as Loading,d as MissingData,c as Success,f as __namedExportsOrder,s as default};