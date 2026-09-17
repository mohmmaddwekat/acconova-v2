<?php
namespace App\Http\Controllers;
use App\Models\User;
use App\Notifications\ProfileEmailChangeNotification;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\HttpFoundation\Response;
class ProfileController extends Controller {
 public function show(Request $request): JsonResponse {$user=$request->user();return response()->json(['user'=>$user->only(['id','name','email','phone','job_title','bio','pending_email','email_verified_at','created_at']),'avatar_url'=>$user->avatar_path?route('profile.avatar',['version'=>$user->updated_at->timestamp]):null,'sessions'=>config('session.driver')==='database'?DB::connection(config('session.connection'))->table(config('session.table','sessions'))->where('user_id',$user->id)->orderByDesc('last_activity')->get(['id','ip_address','user_agent','last_activity'])->map(fn($row): array=>['id'=>$row->id,'ip'=>$row->ip_address,'agent'=>$row->user_agent,'last_activity'=>$row->last_activity,'current'=>$row->id===$request->session()->getId()]):[]]);}
 public function update(Request $request): JsonResponse {$data=$request->validate(['name'=>['required','string','max:255'],'phone'=>['nullable','string','max:50'],'job_title'=>['nullable','string','max:255'],'bio'=>['nullable','string','max:1000']]);$request->user()->forceFill($data)->save();return $this->show($request);}
 public function avatar(Request $request): Response {abort_unless($request->user()->avatar_path,404);return Storage::disk('local')->response($request->user()->avatar_path,null,['Cache-Control'=>'private, max-age=300','X-Content-Type-Options'=>'nosniff']);}
 public function uploadAvatar(Request $request): JsonResponse {$request->validate(['avatar'=>['required','image','mimes:jpg,jpeg,png,webp','max:2048','dimensions:max_width=3000,max_height=3000']]);$user=$request->user();$old=$user->avatar_path;$path=$request->file('avatar')->store('profile-avatars','local');$user->forceFill(['avatar_path'=>$path])->save();if($old){Storage::disk('local')->delete($old);}return $this->show($request);}
 public function password(Request $request): JsonResponse {$data=$request->validate(['current_password'=>['required','current_password'],'password'=>['required','confirmed',Password::min(12)->mixedCase()->numbers()]]);$request->user()->forceFill(['password'=>$data['password'],'remember_token'=>Str::random(60)])->save();$request->session()->regenerate();$this->deleteOtherSessions($request);return response()->json(['saved'=>true]);}
 public function sessions(Request $request): JsonResponse {$request->validate(['current_password'=>['required','current_password']]);$request->user()->forceFill(['remember_token'=>Str::random(60)])->save();$this->deleteOtherSessions($request);return response()->json(['saved'=>true]);}
 private function deleteOtherSessions(Request $request): void {if(config('session.driver')==='database'){DB::connection(config('session.connection'))->table(config('session.table','sessions'))->where('user_id',$request->user()->id)->where('id','!=',$request->session()->getId())->delete();}}
 public function email(Request $request): JsonResponse {$request->merge(['email'=>strtolower(trim((string)$request->input('email')))]);$data=$request->validate(['current_password'=>['required','current_password'],'email'=>['required','email','max:255',Rule::unique('users','email')]]);$request->user()->forceFill(['pending_email'=>$data['email']])->save();$url=URL::temporarySignedRoute('profile.email.confirm',now()->addHour(),['user'=>$request->user()->id,'email'=>$data['email']]);Notification::route('mail',$data['email'])->notify(new ProfileEmailChangeNotification($url));return response()->json(['saved'=>true]);}
 public function confirmEmail(Request $request): RedirectResponse {$request->validate(['email'=>['required','email','max:255',Rule::unique('users','email')]]);DB::transaction(function()use($request): void {$user=User::lockForUpdate()->findOrFail($request->user()->id);abort_unless((int)$request->query('user')===$user->id && $user->pending_email===$request->query('email'),403);$user->forceFill(['email'=>$user->pending_email,'pending_email'=>null,'email_verified_at'=>now(),'remember_token'=>Str::random(60)])->save();});return redirect()->route('app.profile');}
}
