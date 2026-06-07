import AssetInventory, {
  AssetCategory,
  AssetStatus,
  InventoryStatus,
  ExceptionType
} from './index';

function log(title: string, data?: any) {
  console.log(`\n========== ${title} ==========`);
  if (data !== undefined) {
    console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }
}

function runTest() {
  console.log('🚀 企业资产盘点类库 - 功能验证测试');

  log('1. 资产注册 - 注册资产');
  const asset1 = AssetInventory.asset.registerAsset({
    assetNo: 'AST001',
    name: 'ThinkPad X1 Carbon',
    category: AssetCategory.COMPUTER,
    location: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' },
    responsiblePerson: '张三',
    department: '技术部',
    status: AssetStatus.IN_USE,
    brand: '联想',
    model: 'X1 Carbon Gen 10',
    price: 12000,
    purchaseDate: '2024-01-15'
  });
  console.log('资产1:', asset1.assetNo, asset1.name);

  const asset2 = AssetInventory.asset.registerAsset({
    assetNo: 'AST002',
    name: 'Dell 27寸显示器',
    category: AssetCategory.COMPUTER,
    location: { building: 'A座', floor: '5层', room: '501室', position: '2号工位' },
    responsiblePerson: '李四',
    department: '技术部',
    status: AssetStatus.IN_USE
  });
  console.log('资产2:', asset2.assetNo, asset2.name);

  const asset3 = AssetInventory.asset.registerAsset({
    assetNo: 'AST003',
    name: '办公桌椅套装',
    category: AssetCategory.FURNITURE,
    location: { building: 'B座', floor: '3层', room: '302室' },
    responsiblePerson: '王五',
    department: '行政部',
    status: AssetStatus.IN_USE
  });
  console.log('资产3:', asset3.assetNo, asset3.name);

  log('2. 标签解析 - 生成并解析二维码');
  const qrContent = AssetInventory.tag.generateQRContent('AST001');
  console.log('生成QR内容:', qrContent);

  const parsedTag = AssetInventory.tag.parse(qrContent, 'qr');
  console.log('解析结果:', parsedTag.assetNo, '校验通过:', AssetInventory.tag.validateTag(parsedTag));

  log('3. 盘点任务 - 创建盘点批次');
  const task = AssetInventory.task.createTask({
    name: '2024年Q2技术部资产盘点',
    batchNo: 'INV-2024-Q2-001',
    operator: '盘点员A',
    department: '技术部',
    planAssetIds: [asset1.id, asset2.id]
  });
  console.log('盘点任务:', task.name, task.batchNo, '状态:', task.status);

  AssetInventory.task.startTask(task.id);
  console.log('启动任务后状态:', InventoryStatus.IN_PROGRESS);

  log('4. 盘点任务 - 提交扫描结果');
  const scan1 = AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'AST001',
    scanner: '盘点员A',
    scanLocation: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' }
  });
  console.log('扫描1:', scan1.assetNo, '状态:', scan1.status);

  const scan2 = AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'AST002',
    scanner: '盘点员A',
    scanLocation: { building: 'A座', floor: '5层', room: '501室', position: '2号工位' }
  });
  console.log('扫描2:', scan2.assetNo, '状态:', scan2.status);

  log('5. 位置校验 - 错位判断');
  const checkResult = AssetInventory.location.checkLocation(
    asset1,
    { building: 'A座', floor: '5层', room: '501室', position: '1号工位' }
  );
  console.log('位置是否正确:', checkResult.isCorrect);

  const misplacedResult = AssetInventory.location.checkLocation(
    asset1,
    { building: 'B座', floor: '3层', room: '302室' }
  );
  console.log('错位检查 - 是否错位:', !misplacedResult.isCorrect);
  console.log('差异:', misplacedResult.difference);

  log('6. 盘点任务 - 提交错位扫描');
  const scanMisplaced = AssetInventory.task.submitScanByTag(
    task.id,
    AssetInventory.tag.generateQRContent('AST003'),
    '盘点员A',
    { building: 'A座', floor: '5层', room: '501室' }
  );
  console.log('错位扫描:', scanMisplaced.assetNo, '状态:', scanMisplaced.status);

  log('7. 盘点任务 - 重复扫描');
  const duplicateScan = AssetInventory.task.submitScan({
    taskId: task.id,
    assetNo: 'AST001',
    scanner: '盘点员A',
    scanLocation: { building: 'A座', floor: '5层', room: '501室', position: '1号工位' }
  });
  console.log('重复扫描:', duplicateScan.assetNo, '是否重复:', duplicateScan.isDuplicate);

  log('8. 状态变更 - 标记闲置');
  const idleAsset = AssetInventory.status.markIdle(asset3.id, '管理员', '长期未使用，暂存仓库');
  console.log('状态变更后:', idleAsset.assetNo, idleAsset.status);

  log('9. 异常记录 - 记录异常');
  const exception = AssetInventory.exception.createException({
    taskId: task.id,
    assetId: asset3.id,
    assetNo: asset3.assetNo,
    type: ExceptionType.MISPLACED,
    description: '发现在A座501室，但应该在B座302室',
    reporter: '盘点员A'
  });
  console.log('异常记录:', exception.id, '类型:', exception.type, '审批状态:', exception.approvalStatus);

  log('10. 异常审批 - 通过异常');
  const approvedException = AssetInventory.exception.approve(exception.id, '部门经理', '情况属实，安排转移');
  console.log('审批后状态:', approvedException.approvalStatus);

  log('11. 结果汇总 - 完成率');
  const completionRate = AssetInventory.summary.calculateCompletionRate(task.id);
  console.log('盘点完成率:', completionRate + '%');

  log('12. 结果汇总 - 未盘资产');
  const unscanned = AssetInventory.summary.getUnscannedAssets(task.id);
  console.log('未盘资产数量:', unscanned.length);
  unscanned.forEach(a => console.log('  -', a.assetNo, a.name));

  log('13. 结果汇总 - 差异清单');
  const differences = AssetInventory.summary.generateDifferenceList(task.id);
  console.log('差异项数量:', differences.length);
  differences.forEach(d => console.log('  -', d.assetNo, d.differenceType, ':', d.description));

  log('14. 结果汇总 - 部门汇总');
  const deptSummary = AssetInventory.summary.summarizeByDepartment(task.id);
  console.log('部门汇总:', deptSummary.length, '个部门');
  deptSummary.forEach(d => console.log('  -', d.department, '完成率:', d.completionRate + '%'));

  log('15. 资产履历');
  const history = AssetInventory.asset.getAssetHistory(asset3.id);
  console.log('资产履历记录数:', history.length);
  history.slice(0, 3).forEach(h => console.log('  -', h.title, h.timestamp));

  log('16. 盘点报告');
  AssetInventory.task.completeTask(task.id);
  const report = AssetInventory.summary.generateReport(task.id);
  console.log('报告 - 总资产:', report.totalAssets);
  console.log('报告 - 已盘:', report.scannedAssets);
  console.log('报告 - 未盘:', report.unscannedAssets);
  console.log('报告 - 错位:', report.misplacedAssets);
  console.log('报告 - 完成率:', report.completionRate + '%');
  console.log('报告 - 准确率:', report.accuracyRate + '%');
  console.log('报告 - 差异项数:', report.differenceList.length);

  log('17. 责任人变更');
  const updatedAsset = AssetInventory.asset.updateResponsiblePerson(asset1.id, '赵六', '人事专员');
  console.log('新责任人:', updatedAsset.responsiblePerson);

  log('✅ 所有功能验证完成');
}

try {
  runTest();
} catch (e) {
  console.error('❌ 测试出错:', e);
}
