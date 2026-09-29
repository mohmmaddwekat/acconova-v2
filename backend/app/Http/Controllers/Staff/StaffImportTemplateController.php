<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StaffImportTemplateController extends Controller
{
    public function __invoke(Request $request): StreamedResponse
    {
        abort_unless(StaffController::allowed('staff.import'), 403);

        $spreadsheet = new Spreadsheet;
        $this->employeesSheet($spreadsheet);
        $this->attendanceSheet($spreadsheet);
        $this->instructionsSheet($spreadsheet);
        $spreadsheet->setActiveSheetIndex(0);

        foreach ($spreadsheet->getWorksheetIterator() as $worksheet) {
            $worksheet->freezePane('A2');
            $worksheet->setRightToLeft(true);

            foreach (range('A', $worksheet->getHighestColumn()) as $column) {
                $worksheet->getColumnDimension($column)->setAutoSize(true);
            }

            $highestColumn = $worksheet->getHighestColumn();
            $worksheet->getStyle("A1:{$highestColumn}1")->getFont()->setBold(true);
            $worksheet->getStyle("A1:{$highestColumn}1")
                ->getFill()
                ->setFillType(Fill::FILL_SOLID)
                ->getStartColor()
                ->setARGB('FFE8F3FF');
            $worksheet->getStyle("A1:{$highestColumn}1")
                ->getAlignment()
                ->setHorizontal(Alignment::HORIZONTAL_CENTER);
        }

        return response()->streamDownload(
            function () use ($spreadsheet): void {
                (new Xlsx($spreadsheet))->save('php://output');
                $spreadsheet->disconnectWorksheets();
            },
            'acconova-staff-import-template.xlsx',
            [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Cache-Control' => 'no-store, private',
            ],
        );
    }

    private function employeesSheet(Spreadsheet $spreadsheet): void
    {
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('الموظفون');
        $sheet->fromArray([
            [
                'اسم الموظف',
                'المسمى الوظيفي',
                'الهاتف',
                'البريد الإلكتروني',
                'القسم',
                'أساس الأجر',
                'الوحدة',
                'الراتب/المعدل',
                'العلاوة الشهرية',
                'تاريخ بدء العمل',
                'الحالة',
            ],
            [
                'أحمد محمد',
                'محاسب',
                '0599000000',
                'ahmad@example.com',
                'المالية',
                'شهري',
                '',
                3500,
                250,
                '2026-01-01',
                'نشط',
            ],
        ], null, 'A1');
    }

    private function attendanceSheet(Spreadsheet $spreadsheet): void
    {
        $sheet = $spreadsheet->createSheet();
        $sheet->setTitle('الحضور');
        $sheet->fromArray([
            [
                'معرّف الموظف',
                'التاريخ',
                'الحالة',
                'الكمية/الساعات',
                'ساعات إضافية',
                'أجر ساعة الإضافي',
                'ملاحظات',
            ],
            [
                'أحمد محمد',
                '2026-09-01',
                'حاضر',
                8,
                2,
                25,
                'صف مثال - استبدله أو احذفه قبل الاستيراد',
            ],
            [
                'أحمد محمد',
                '2026-09-04',
                'غائب',
                0,
                0,
                0,
                'مثال غياب',
            ],
        ], null, 'A1');
    }

    private function instructionsSheet(Spreadsheet $spreadsheet): void
    {
        $sheet = $spreadsheet->createSheet();
        $sheet->setTitle('تعليمات');
        $sheet->fromArray([
            ['تعليمات نموذج استيراد الموظفين في AccoNova', 'القيمة / الملاحظة'],
            ['طريقة الاستخدام', 'استورد الموظفين أولًا ثم الحضور. لا يوجد ملف مستقل للمستحقات.'],
            ['صيغة التاريخ', 'YYYY-MM-DD مثل 2026-09-30'],
            ['أساس الأجر', 'ساعة، يوم، شهر، قطعة. يقبل النظام أيضًا: hourly, daily, monthly, piece.'],
            ['حالة الموظف', 'نشط/نعم/فعال = نشط. اتركها فارغة ليكون الموظف نشطًا افتراضيًا.'],
            ['حالة الحضور', 'حاضر أو غائب. يقبل النظام أيضًا present / absent.'],
            ['احتساب الراتب المستحق', 'للموظف بالساعة أو اليوم أو القطعة، الحضور ينشئ أو يحدّث الراتب المستحق تلقائيًا حسب الكمية × معدل الموظف، والإضافي يُحسب تلقائيًا أيضًا.'],
            ['الموظف الشهري', 'الراتب الشهري يُعتمد من شروط راتب الموظف وليس من ملف مستحقات مستقل.'],
            ['العمليات اليدوية', 'سجّل فقط الدفعات والخصومات والمكافآت والبدلات والسلف من داخل صفحة الموظف.'],
            ['مطابقة الموظف', 'يمكن المطابقة بالاسم أو الهاتف أو البريد الإلكتروني. مطابقة الاسم تتسامح مع بعض اختلافات الكتابة العربية الشائعة.'],
            ['الأقسام', 'فعّل خيار إنشاء الأقسام غير الموجودة تلقائيًا إذا كان الملف يحتوي أقسامًا جديدة.'],
            ['تنبيه', 'صفوف المثال للتوضيح فقط؛ احذفها قبل استيراد بيانات حقيقية.'],
        ], null, 'A1');
    }
}
