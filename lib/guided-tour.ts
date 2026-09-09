import { demoState } from './demo';
import { transition, type Member, type State, type Action } from './workflow';

export type TourStep = {id:string; title:string; text:string; target:string};
export const practiceId = (role:Member['role']) => ({approver:'owner',manager:'yaniv',editor:'john',campaign:'carl'})[role];
export function practiceState(member:Member):State {
  const state=demoState(), id=practiceId(member.role);
  state.members.find(m=>m.id===id)!.name=member.name;
  state.tasks.push({id:'tour-received',kind:'custom',title:'Practice: check the opening shot',clientId:'',assignee:id,createdBy:id==='owner'?'yaniv':'owner',status:'open',notes:'Watch the opening shot, leave a comment for the requester, then mark this practice task complete.',createdAt:new Date().toISOString(),dueAt:null,cycle:0});
  state.tasks.push({id:'tour-closebot',kind:'custom',title:'Practice: integrate Closebot with GHL and Facebook',clientId:'demo-2',assignee:'yaniv',createdBy:'owner',status:'open',notes:'After completing the integration in the external tools, mark this task complete here.',createdAt:new Date().toISOString(),dueAt:null,cycle:0});
  // Each account gets an inbox example without relying on a real teammate.
  state.notifications.push({id:'tour-notice',userId:id,clientId:'',taskId:'tour-received',text:'Practice: a teammate assigned you an opening-shot check',createdAt:new Date().toISOString(),read:false});
  return state;
}
export function practiceAction(state:State,member:Member,action:Action):State {
  // Share real workflow validation. No API/storage/notification transport is involved.
  if(action.type==='createTask'&&(action.task?.assignee===member.id||!action.task?.notes?.trim()))throw new Error('For this practice task, choose another teammate and add instructions, then try again.');
  return transition(state,member,action);
}
export function tourSteps(role:Member['role']):TourStep[] {
  const steps:TourStep[]=[
    {id:'work',title:'Find your assignments',text:'Tap My work. This is your daily starting point. You are using the real app controls with disposable practice data.',target:'[data-tour="nav-work"]'},
    {id:'received',title:'Open a task',text:'Open “Practice: check the opening shot”. A task contains the instructions, requester, assignee and deadline.',target:'[data-tour-task="tour-received"]'},
    {id:'comment',title:'Reply where the work lives',text:'In Task comments, tap @, choose a teammate, write a short update, then Post comment. Mentions alert people who already have access to the task.',target:'.message-composer'},
    {id:'complete',title:'Finish the assignment',text:'Tap Mark complete. In your workspace, this notifies the requester. You can reopen a custom task if more work is needed.',target:'[data-tour="complete-task"]'},
    {id:'new',title:'Ask a teammate for help',text:'Tap the + Create task button. Everyone can assign work to anyone, including a refilm request for Val.',target:'[data-tour="create-task"]'},
    {id:'assign',title:'Create an actual practice task',text:'Give it a title, select another teammate and add instructions. Client and deadline are optional. Tap Assign task; it stays inside this practice session.',target:'[data-tour="task-form"]'},
    {id:'sent',title:'Track what you requested',text:'Tap Assigned by me. Your new task appears here so you can follow up without searching through everyone’s work.',target:'[data-tour="filter-sent"]'},
  ];
  if(role==='editor') steps.push(
    {id:'edit',title:'Open your editing assignment',text:'Open the Coastal Shine editing task. Look at its deadline and instructions. Raw footage, when uploaded, appears in this same client panel.',target:'[data-tour-task="edit-1"]'},
    {id:'submit',title:'Submit the whole edits folder',text:'Paste https://drive.google.com/drive/folders/practice-edits into the folder-link field, then Submit for approval. In real work, use your actual folder and share it with the reviewer. Submission pauses the clock; revisions restart it with six hours.',target:'[data-tour="submit"]'},
  );
  if(role==='campaign') steps.push(
    {id:'campaign-open',title:'Find the approved campaign work',text:'Open the Precision Mobile campaign task. An approved edit creates this assignment with a 24-hour deadline. Submitted edits appear as a Drive link in this panel.',target:'[data-tour-task="campaign-2"]'},
    {id:'campaign',title:'Hand off the completed campaign',text:'After setup in the ad tools, use Mark campaign setup complete. Try it here. The app automatically assigns Yaniv the Closebot/GHL/Facebook follow-up.',target:'[data-tour="campaign"]'},
  );
  if(role==='approver'||role==='manager') steps.push(
    {id:'board',title:'Read the delivery board',text:'Tap Client progress. Cards move from onboarding through filming, review, campaign setup and launch. The Google Form brings clients in; receiving a form does not finish the checklist.',target:'[data-tour="nav-board"]'},
    {id:'client',title:'Open a client',text:'Open Luxe Mobile Detail. This is where you keep that client’s context and next steps together.',target:'[data-tour-client="demo-5"]'},
    {id:'onboard',title:'Confirm the onboarding checklist',text:'Check the remaining items, then Complete onboarding. Only confirm these for real clients after the access, GHL setup, training and intake are done.',target:'[data-tour="onboard"]'},
    {id:'upload',title:'Know where footage goes',text:'This is the actual upload form. Choose videos and use Upload & assign editing in real work; John’s 24-hour deadline starts after a successful upload. Practice needs no file and uploads nothing. Select Next when you’ve found the controls.',target:'.upload-box'},
  );
  if(role==='approver') steps.push(
    {id:'review',title:'Open an edit for review',text:'Open the Summit Auto Detail review task. Review its shared Drive folder first. Only your account can approve ads or request revisions.',target:'[data-tour-task="edit-0"]'},
    {id:'revise',title:'Give actionable revision feedback',text:'Write what needs to change in Revision instructions, then Request revisions. The editor gets a fresh six-hour deadline.',target:'[data-tour="revise"]'},
    {id:'approve',title:'Approve the revised edit',text:'For this exercise, the practice editor has resubmitted. Tap Approve & assign campaign setup. This completes editing and creates Karl’s campaign assignment.',target:'[data-tour="approve"]'},
    {id:'launch',title:'Record the actual launch',text:'For the practice client, check the launch-call and external-payment confirmations, then Record ads launched. Real confirmations belong after those steps are done; this starts the 14-day trial and its review reminder.',target:'[data-tour="launch"]'},
  );
  if(role==='manager') steps.push(
    {id:'integration-open',title:'Find your integration follow-up',text:'Open “Practice: integrate Closebot with GHL and Facebook”. Campaign completion creates this type of task for you automatically.',target:'[data-tour-task="tour-closebot"]'},
    {id:'integration',title:'Finish the integration handoff',text:'After connecting Closebot in GHL and the Facebook account, mark the task complete. The app tracks the work; it does not perform those external integrations for you.',target:'[data-tour="complete-task"]'},
  );
  steps.push(
    {id:'chat',title:'Open the messenger',text:'Tap Chat to see your conversations. Team chat is shared; conversations named for a teammate are private between the two of you.',target:'[data-tour="nav-chat"]'},
    {id:'team-open',title:'Choose the team conversation',text:'Select Team chat. On a phone this opens a full-screen conversation, with a back arrow to the list.',target:'[data-tour-chat="team"]'},
    {id:'team-send',title:'Send a team update',text:'Use @ to choose a teammate, type a practice update and tap Send message. In real work this notifies the team; these practice messages stay here.',target:'.message-composer'},
    {id:'direct-open',title:'Choose a private conversation',text:'Select a teammate from the conversation list. On phones, use the back arrow to return to the list first.',target:'.chat-list nav'},
    {id:'direct-send',title:'Send a private message',text:'Type a short practice message and tap Send. Only the two participants can open this conversation. Use task comments for feedback that belongs with a task.',target:'.message-composer'},
    {id:'inbox',title:'Find your updates',text:'Tap Inbox. Assignments, mentions, completed work and deadline reminders appear here. Clicking a notice takes you to its work.',target:'[data-tour="nav-notifications"]'},
    {id:'read',title:'Clear the updates you have read',text:'Tap Mark all read. This clears unread badges; it does not delete work or messages.',target:'[data-tour="read"]'},
    {id:'profile',title:'Open your profile menu',text:'Tap your initials in the top-right corner. This menu contains your work, inbox, chat, settings and appearance controls.',target:'[data-tour="profile"]'},
    {id:'settings',title:'Find your account settings',text:'Open your profile menu again and choose Settings & notifications. You can change your appearance, password and device notification settings here.',target:'[data-tour="profile"]'},
    {id:'push',title:'Find phone notifications',text:'Enable push notifications on each device you want alerts on. John and Karl have their phone guides below. This practice workspace cannot subscribe a device; the next screen offers your real settings and password.',target:'.push-actions'},
  );
  return steps;
}

export type TourSnapshot={view:string;selected:string|null;taskId?:string;creating:boolean;filter:string;chat:string;events:string[];profileOpen:boolean};
export function stepComplete(id:string,c:TourSnapshot):boolean {
  switch(id){
    case 'work': return c.view==='work';
    case 'received':return c.taskId==='tour-received';
    case 'new':return c.creating;
    case 'sent':return c.view==='work'&&c.filter==='sent';
    case 'edit':return c.selected==='demo-1';
    case 'campaign-open':return c.selected==='demo-2';
    case 'board':return c.view==='board';
    case 'client':return c.selected==='demo-5';
    case 'review':return c.selected==='demo-0';
    case 'integration-open':return c.taskId==='tour-closebot';
    case 'chat':return c.view==='chat';
    case 'team-open':return c.chat==='team';
    case 'direct-open':return !!c.chat&&c.chat!=='team';
    case 'inbox':return c.view==='notifications';
    case 'profile':return c.profileOpen;
    case 'settings':return c.view==='settings';
    case 'upload':case 'push':return true;
    default:return c.events.includes(id);
  }
}
export function actionMilestones(a:Action,me:Member):string[] {
  if(a.type==='sendMessage'&&a.message){
    const kind=a.message.target.kind;
    if(kind==='task'&&a.message.target.taskId==='tour-received'&&/@\w/.test(a.message.body)) return ['comment'];
    if(kind==='team'&&/@\w/.test(a.message.body)) return ['team-send'];
    if(kind==='direct') return ['direct-send'];
  }
  if(a.type==='createTask'&&a.task?.assignee!==me.id&&a.task?.notes?.trim())return ['assign'];
  if(a.type==='completeTask')return a.taskId==='tour-received'?['complete']:a.taskId==='tour-closebot'?['integration']:[];
  return ({submit:['submit'],campaign:['campaign'],onboard:['onboard'],revise:['revise'],approve:['approve'],launch:['launch'],read:['read']} as Record<string,string[]>)[a.type]||[];
}
