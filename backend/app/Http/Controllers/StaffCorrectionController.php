<?php
namespace App\Http\Controllers;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Models\Department;
use App\Support\InventoryQuantity as Decimal;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
class StaffCorrectionController extends Controller {
 /** @param array<string,mixed> $before @param array<string,mixed>|null $after */
 public static function audit(StaffMember $member,string $entity,int $id,string $action,string $reason,array $before,?array $after=null): void {DB::table('staff_corrections')->insert(['organization_id'=>$member->organization_id,'staff_member_id'=>$member->id,'created_by'=>auth()->id(),'entity'=>$entity,'entity_id'=>$id,'action'=>$action,'reason'=>$reason,'before'=>json_encode($before,JSON_THROW_ON_ERROR),'after'=>$after?json_encode($after,JSON_THROW_ON_ERROR):null,'created_at'=>now(),'updated_at'=>now()]);}
 public function entry(Request $request,string $staff,string $entry): JsonResponse {
  $data=$request->validate(['reason'=>['required','string','max:1000'],'amount'=>['required_if:_method,PATCH','sometimes','numeric','gt:0','max:999999999','regex:/^\d+(\.\d{1,4})?$/'],'quantity'=>['sometimes','numeric','gt:0','max:9999','regex:/^\d+(\.\d{1,4})?$/'],'notes'=>['sometimes','string','max:2000']]);
  DB::transaction(function()use($request,$staff,$entry,$data): void {$member=StaffMember::lockForUpdate()->findOrFail($staff);abort_unless(StaffController::canPay($member),403);$row=StaffEntry::where('staff_member_id',$member->id)->findOrFail($entry);abort_if($row->kind==='terms' || isset($row->terms['attendance_id']),422);$before=$row->toArray();
   if($request->isMethod('DELETE')){$row->delete();self::audit($member,'entry',$row->id,'delete',$data['reason'],$before);return;}
   if($row->kind==='work'){$quantity=(string)($data['quantity']??$row->quantity);abort_if(($row->terms['basis']??null)==='month' && Decimal::toUnits($quantity)!==10000,422);$row->quantity=$quantity;$row->amount=Decimal::fromUnits(intdiv(Decimal::toUnits($quantity)*Decimal::toUnits($row->rate)+5000,10000));}else{abort_unless(isset($data['amount']),422);$row->amount=Decimal::fromUnits(Decimal::toUnits($data['amount'])*(in_array($row->kind,['deduction','payment','advance'],true)?-1:1));}
   $row->notes=$data['notes']??$row->notes;$row->save();self::audit($member,'entry',$row->id,'update',$data['reason'],$before,$row->toArray());
  });return response()->json(['saved'=>true]);
 }
 public function attendance(Request $request,string $staff,string $attendance,StaffWorkforceController $workforce): JsonResponse {
  $data=$request->validate(['reason'=>['required','string','max:1000']]);
  return DB::transaction(function()use($staff,$attendance,$request,$data,$workforce): JsonResponse {$member=StaffMember::lockForUpdate()->findOrFail($staff);abort_unless(StaffController::canPay($member),403);$row=DB::table('staff_attendances')->where('staff_member_id',$member->id)->where('id',$attendance)->first();abort_unless($row,404);self::audit($member,'attendance',(int)$row->id,$request->isMethod('DELETE')?'delete':'replace',$data['reason'],(array)$row);StaffEntry::where('staff_member_id',$member->id)->where('terms->attendance_id',(int)$row->id)->delete();DB::table('staff_attendances')->where('id',$row->id)->delete();return $request->isMethod('DELETE')?response()->json(['saved'=>true]):$workforce->attendance($request,$staff);});
 }
 public function adjustment(Request $request,string $staff,string $adjustment): JsonResponse {
  $data=$request->validate(['reason'=>['required','string','max:1000'],'label'=>['sometimes','required','string','max:255'],'amount'=>['sometimes','numeric','gt:0','max:999999999','regex:/^\d+(\.\d{1,4})?$/'],'starts_on'=>['sometimes','date_format:Y-m-d'],'ends_on'=>['nullable','date_format:Y-m-d']]);
  DB::transaction(function()use($request,$staff,$adjustment,$data): void {$member=StaffMember::lockForUpdate()->findOrFail($staff);abort_unless(StaffController::canPay($member),403);$row=DB::table('staff_adjustments')->where('staff_member_id',$member->id)->where('id',$adjustment)->first();abort_unless($row,404);$before=(array)$row;
   if($request->isMethod('DELETE')){DB::table('staff_adjustments')->where('id',$row->id)->delete();self::audit($member,'adjustment',(int)$row->id,'delete',$data['reason'],$before);return;}
   $last=StaffEntry::withTrashed()->where('staff_member_id',$member->id)->where('terms->adjustment_id',(int)$row->id)->max('occurred_on');
   abort_if($last && (isset($data['amount'])&&(string)$data['amount']!==(string)$row->amount || isset($data['starts_on'])&&$data['starts_on']!==$row->starts_on),422);
   $start=$data['starts_on']??$row->starts_on;$end=$data['ends_on']??null;abort_if($start<substr((string)$member->started_on,0,10) || ($end && ($end<$start || ($last&&$end<substr((string)$last,0,10)))),422);
   unset($data['reason']);DB::table('staff_adjustments')->where('id',$row->id)->update([...$data,'updated_at'=>now()]);self::audit($member,'adjustment',(int)$row->id,'update',$request->input('reason'),$before,[...$before,...$data]);
  });return response()->json(['saved'=>true]);
 }
 public function destroy(Request $request,string $staff): JsonResponse {
  $data=$request->validate(['reason'=>['required','string','max:1000']]);DB::transaction(function()use($staff,$data): void {abort_unless(StaffController::allowed('staff.manage'),403);$member=StaffMember::lockForUpdate()->findOrFail($staff);abort_if(Decimal::toUnits((string)StaffEntry::where('staff_member_id',$member->id)->sum('amount'))!==0,422);self::audit($member,'staff',$member->id,'delete',$data['reason'],$member->toArray());Department::where('manager_id',$member->id)->update(['manager_id'=>null]);DB::table('staff_invitations')->where('staff_member_id',$member->id)->whereNull('accepted_at')->delete();$member->update(['active'=>false]);$member->delete();});return response()->json(['saved'=>true]);
 }
}
