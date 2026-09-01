import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{n as i,t as a}from"./asset-custom-field-fixtures-DLfaNaax.js";import{n as o,t as s}from"./asset-custom-field-table-CTBN11J7.js";function c({data:e,isFetching:t,isPending:n,refetch:r}){return{data:e,error:null,failureCount:0,failureReason:null,errorUpdateCount:0,isError:!1,isFetched:!n,isFetchedAfterMount:!n,isFetching:t,isInitialLoading:n,isLoading:n,isLoadingError:!1,isPaused:!1,isPending:n,isPlaceholderData:!1,isRefetchError:!1,isRefetching:t,isStale:!1,isSuccess:!n,status:n?`pending`:`success`,fetchStatus:t||n?`fetching`:`idle`,dataUpdatedAt:0,errorUpdatedAt:0,isEnabled:!0,promise:Promise.resolve(e??[]),refetch:r}}function l({fields:e,pending:t=!1,selectedCustomFieldId:n,onSelectCustomField:r,onOpenCustomField:i,onCreateCustomField:a,onDeleteCustomFields:o}){let[l,f]=(0,u.useState)({globalFilter:``,selectFilters:{}});return(0,d.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,d.jsx)(s,{query:c({data:t?void 0:e,isFetching:!1,isPending:t,refetch:()=>Promise.resolve({data:e})}),selectedCustomFieldId:n,onSelectCustomField:r,onOpenCustomField:i,onCreateCustomField:a,onDeleteCustomFields:o,filterState:l,onFilterStateChange:f})})}var u,d,f,p,m,h,g,_,v,y,b,x,S,C;t((()=>{u=e(n(),1),i(),o(),d=r(),{expect:f,fn:p,userEvent:m}=__STORYBOOK_MODULE_TEST__,h={title:`Resources/Custom Fields/Table`,component:l,tags:[`!test`],parameters:{layout:`padded`},args:{fields:a},render:e=>(0,d.jsx)(l,{...e})},g={},_={args:{pending:!0}},v={args:{fields:[]}},y={args:{selectedCustomFieldId:`7f732d2b-8985-4551-b45d-0eaf527a1577`}},b={args:{onSelectCustomField:p(),onOpenCustomField:p()},play:async({canvas:e,args:t})=>{let n=await e.findByText(`Environment`);await m.click(n),await f(t.onSelectCustomField).toHaveBeenCalled(),await m.dblClick(n),await f(t.onOpenCustomField).toHaveBeenCalled()}},x={args:{onDeleteCustomFields:p(async()=>{})}},S={args:{onCreateCustomField:p()},play:async({canvas:e,args:t})=>{await m.click(await e.findByRole(`button`,{name:/new custom field/i})),await f(t.onCreateCustomField).toHaveBeenCalled()}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    pending: true
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    fields: []
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    selectedCustomFieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577"
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    onSelectCustomField: fn(),
    onOpenCustomField: fn()
  },
  play: async ({
    canvas,
    args
  }) => {
    const rowLabel = await canvas.findByText("Environment");
    await userEvent.click(rowLabel);
    await expect(args.onSelectCustomField).toHaveBeenCalled();
    await userEvent.dblClick(rowLabel);
    await expect(args.onOpenCustomField).toHaveBeenCalled();
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    onDeleteCustomFields: fn(async () => {})
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateCustomField: fn()
  },
  play: async ({
    canvas,
    args
  }) => {
    await userEvent.click(await canvas.findByRole("button", {
      name: /new custom field/i
    }));
    await expect(args.onCreateCustomField).toHaveBeenCalled();
  }
}`,...S.parameters?.docs?.source}}},C=[`Default`,`Loading`,`Empty`,`ActiveRow`,`Selection`,`Deletable`,`Creatable`]}))();export{y as ActiveRow,S as Creatable,g as Default,x as Deletable,v as Empty,_ as Loading,b as Selection,C as __namedExportsOrder,h as default};