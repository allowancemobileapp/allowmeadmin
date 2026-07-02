import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { BookOpen, Folder, File, Zap } from 'lucide-react';

export default function Library() {
  const { get, post, put, del } = useApi();
  const [schools, setSchools] = useState<any[]>([]);
  const [colleges, setColleges] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  // Selection states
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedCollege, setSelectedCollege] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  // Form states
  const [collegeName, setCollegeName] = useState('');
  
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');

  const [materialType, setMaterialType] = useState('past_question'); // past_question, book, note
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialYear, setMaterialYear] = useState('');
  const [materialSemester, setMaterialSemester] = useState('1st Semester');
  const [materialPrice, setMaterialPrice] = useState('0');
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [generatingQuiz, setGeneratingQuiz] = useState<number | null>(null);
  const [viewingQuizFor, setViewingQuizFor] = useState<any>(null);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    const data = await get<any[]>('/api/schools');
    setSchools(data);
  };

  useEffect(() => {
    if (selectedSchool) fetchColleges(selectedSchool);
    else setColleges([]);
  }, [selectedSchool]);

  const fetchColleges = async (sId: string) => {
    const data = await get<any[]>(`/api/library/colleges?school_id=${sId}`);
    setColleges(data);
  };

  useEffect(() => {
    if (selectedCollege) fetchCourses(selectedCollege);
    else setCourses([]);
  }, [selectedCollege]);

  const fetchCourses = async (cId: string) => {
    const data = await get<any[]>(`/api/library/courses?college_id=${cId}`);
    setCourses(data);
  };

  useEffect(() => {
    if (selectedCourse) fetchMaterials(selectedCourse);
    else setMaterials([]);
  }, [selectedCourse]);

  const fetchMaterials = async (cId: string) => {
    const data = await get<any[]>(`/api/library/library_materials?course_id=${cId}`);
    setMaterials(data);
  };

  const handleAddCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return alert("Select a school");
    try {
      await post('/api/library/colleges', { school_id: parseInt(selectedSchool), name: collegeName });
      setCollegeName('');
      fetchColleges(selectedSchool);
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteCollege = async (id: number) => {
    if (!window.confirm("Delete college?")) return;
    try {
      await del(`/api/library/colleges/${id}`);
      fetchColleges(selectedSchool);
      if (selectedCollege === id.toString()) setSelectedCollege('');
    } catch (err: any) { alert(err.message); }
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollege) return alert("Select a college");
    try {
      await post('/api/library/courses', { 
        college_id: parseInt(selectedCollege), 
        course_code: courseCode, 
        course_title: courseTitle, 
        course_description: courseDesc 
      });
      setCourseCode(''); setCourseTitle(''); setCourseDesc('');
      fetchCourses(selectedCollege);
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteCourse = async (id: number) => {
    if (!window.confirm("Delete course?")) return;
    try {
      await del(`/api/library/courses/${id}`);
      fetchCourses(selectedCollege);
      if (selectedCourse === id.toString()) setSelectedCourse('');
    } catch (err: any) { alert(err.message); }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return alert("Select a course");
    if (!materialFile) return alert("Please select a file to upload");
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', materialFile);
      
      const adminEmail = localStorage.getItem('admin_email') || '';
      
      const uploadRes = await fetch('/api/library/upload', {
        method: 'POST',
        headers: {
          'x-admin-email': adminEmail
        },
        body: formData
      });
      
      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }
      
      const { url } = await uploadRes.json();

      await post('/api/library/library_materials', { 
        course_id: parseInt(selectedCourse), 
        material_type: materialType,
        title: materialTitle,
        academic_year: materialYear,
        semester: materialSemester,
        file_url: url,
        price: parseFloat(materialPrice) || 0
      });
      setMaterialTitle(''); setMaterialYear(''); setMaterialFile(null); setMaterialPrice('0');
      fetchMaterials(selectedCourse);
    } catch (err: any) { 
      alert(err.message); 
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!window.confirm("Delete material?")) return;
    try {
      await del(`/api/library/library_materials/${id}`);
      fetchMaterials(selectedCourse);
    } catch (err: any) { alert(err.message); }
  };

  const handleViewQuizzes = async (material: any) => {
    try {
      const qs = await get<any[]>(`/api/library/quiz_questions?material_id=${material.id}`);
      setQuizQuestions(qs);
      setViewingQuizFor(material);
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteQuizQuestion = async (id: number) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await del(`/api/library/quiz_questions/${id}`);
      setQuizQuestions(q => q.filter(x => x.id !== id));
    } catch (err: any) { alert(err.message); }
  };

  const generateQuiz = async (material: any) => {
    if (!window.confirm(`Generate a pool of 50 pop quiz questions from this ${material.material_type} using AI? This may take up to a minute.`)) return;
    
    setGeneratingQuiz(material.id);
    setViewingQuizFor(material);
    setQuizQuestions([]);
    
    try {
      const res = await post<any[]>('/api/library/quiz_questions/generate', {
        course_id: parseInt(selectedCourse),
        material_id: material.id,
        file_url: material.file_url
      });
      alert(`Successfully generated ${res.length} questions!`);
      setQuizQuestions(res);
    } catch (err: any) {
      alert("Error generating quiz: " + err.message);
      setViewingQuizFor(null);
    } finally {
      setGeneratingQuiz(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Academic Library</h1>
        <p className="text-slate-500 text-sm">Manage colleges, courses, past questions, notes, and AI Pop Quizzes.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Schools & Colleges */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">1. Select School</label>
            <select value={selectedSchool} onChange={e => {setSelectedSchool(e.target.value); setSelectedCollege(''); setSelectedCourse('');}} className="w-full mt-1 border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">-- Choose School --</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {selectedSchool && (
            <div className="pt-4 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-500 uppercase">2. Select/Manage College/Faculty</label>
              <div className="flex flex-col gap-2 mt-2 max-h-40 overflow-y-auto">
                {colleges.map(c => (
                  <div key={c.id} className={`flex items-center justify-between p-2 rounded border cursor-pointer ${selectedCollege === c.id.toString() ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}`} onClick={() => {setSelectedCollege(c.id.toString()); setSelectedCourse('');}}>
                    <span className="text-sm font-medium text-slate-700"><Folder className="w-4 h-4 inline-block mr-2 text-indigo-400"/> {c.name}</span>
                    <button onClick={(e) => {e.stopPropagation(); handleDeleteCollege(c.id);}} className="text-xs text-red-500 hover:underline">Del</button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddCollege} className="flex gap-2 mt-3">
                <input type="text" value={collegeName} onChange={e=>setCollegeName(e.target.value)} required placeholder="New College Name" className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-indigo-700">Add</button>
              </form>
            </div>
          )}
        </div>

        {/* Courses */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">3. Courses under College</label>
            {!selectedCollege ? (
               <p className="text-xs text-slate-400 mt-2">Select a college first.</p>
            ) : (
              <div className="flex flex-col gap-2 mt-2 max-h-48 overflow-y-auto">
                {courses.map(c => (
                  <div key={c.id} className={`flex flex-col p-2 rounded border cursor-pointer ${selectedCourse === c.id.toString() ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}`} onClick={() => setSelectedCourse(c.id.toString())}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">{c.course_code}</span>
                      <button onClick={(e) => {e.stopPropagation(); handleDeleteCourse(c.id);}} className="text-xs text-red-500 hover:underline">Del</button>
                    </div>
                    <span className="text-xs text-slate-600 truncate">{c.course_title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCollege && (
            <div className="pt-4 border-t border-slate-100">
              <form onSubmit={handleAddCourse} className="flex flex-col gap-2 mt-2">
                <input type="text" value={courseCode} onChange={e=>setCourseCode(e.target.value)} required placeholder="Course Code (e.g. MTH101)" className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                <input type="text" value={courseTitle} onChange={e=>setCourseTitle(e.target.value)} required placeholder="Course Title" className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                <input type="text" value={courseDesc} onChange={e=>setCourseDesc(e.target.value)} placeholder="Description (Optional)" className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                <button type="submit" className="bg-indigo-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-indigo-700 mt-1">Add Course</button>
              </form>
            </div>
          )}
        </div>

        {/* Materials */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">4. Library Materials</label>
            {!selectedCourse ? (
               <p className="text-xs text-slate-400 mt-2">Select a course first.</p>
            ) : (
              <div className="flex flex-col gap-3 mt-2 max-h-48 overflow-y-auto pr-1">
                {materials.map(m => (
                  <div key={m.id} className="flex flex-col p-3 rounded-lg border border-slate-200 bg-slate-50 relative group">
                    <button onClick={() => handleDeleteMaterial(m.id)} className="absolute top-2 right-2 text-xs font-bold text-red-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity hover:underline">Del</button>
                    <div className="flex items-center gap-2 mb-1">
                       <File className="w-4 h-4 text-emerald-600" />
                       <span className="text-xs font-bold text-emerald-800 uppercase px-1.5 py-0.5 bg-emerald-100 rounded">{m.material_type.replace('_', ' ')}</span>
                       {m.price > 0 && <span className="text-xs font-bold text-indigo-700">₦{m.price}</span>}
                    </div>
                    <p className="text-sm font-bold text-slate-800 line-clamp-1">{m.title || `${m.course_code} Past Question`}</p>
                    {m.material_type === 'past_question' && (
                        <p className="text-xs text-slate-500">{m.academic_year} • {m.semester}</p>
                    )}
                    <a href={m.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 truncate block">{m.file_url}</a>
                    
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => generateQuiz(m)} 
                        disabled={generatingQuiz === m.id}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 text-white rounded py-1.5 text-[10px] sm:text-xs font-bold hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        {generatingQuiz === m.id ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            GENERATING...
                          </span>
                        ) : <><Zap className="w-3.5 h-3.5" /> GENERATE QUIZ</>}
                      </button>
                      <button 
                        onClick={() => handleViewQuizzes(m)}
                        className="px-3 bg-indigo-100 text-indigo-700 rounded text-xs font-bold hover:bg-indigo-200 transition"
                      >
                        VIEW
                      </button>
                    </div>
                  </div>
                ))}
                {materials.length === 0 && <p className="text-xs text-slate-400">No materials for this course yet.</p>}
              </div>
            )}
          </div>

          {selectedCourse && (
            <div className="pt-4 border-t border-slate-100">
              <form onSubmit={handleAddMaterial} className="flex flex-col gap-2 mt-2">
                <select value={materialType} onChange={e=>setMaterialType(e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium">
                  <option value="past_question">Past Question</option>
                  <option value="book">Book</option>
                  <option value="note">Note</option>
                </select>

                {materialType !== 'past_question' && (
                  <input type="text" value={materialTitle} onChange={e=>setMaterialTitle(e.target.value)} required placeholder="Title (e.g. Intro to Algebra)" className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                )}

                {materialType === 'past_question' && (
                  <>
                    <input type="text" value={materialYear} onChange={e=>setMaterialYear(e.target.value)} required placeholder="Academic Year (e.g. 2024/2025)" className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                    <select value={materialSemester} onChange={e=>setMaterialSemester(e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="1st Semester">1st Semester</option>
                      <option value="2nd Semester">2nd Semester</option>
                    </select>
                  </>
                )}
                
                <div className="flex flex-col gap-1 mt-1">
                  <label className="text-xs font-semibold text-slate-600">File (PDF, Image)</label>
                  <input type="file" accept="image/*,application/pdf" onChange={e => setMaterialFile(e.target.files?.[0] || null)} required className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <label className="text-xs font-semibold text-slate-600">Price (₦):</label>
                  <input type="number" step="0.01" value={materialPrice} onChange={e=>setMaterialPrice(e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>

                <button type="submit" disabled={isUploading} className="bg-emerald-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-emerald-700 mt-2 disabled:opacity-50">
                  {isUploading ? 'Uploading...' : 'Upload Material'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Quiz Modal */}
      {viewingQuizFor && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <div>
                <h3 className="font-bold text-slate-800">AI Pop Quiz</h3>
                <p className="text-xs text-slate-500">From: {viewingQuizFor.title || viewingQuizFor.course_code}</p>
              </div>
              <button onClick={() => {setViewingQuizFor(null); if(generatingQuiz === viewingQuizFor.id) setGeneratingQuiz(null);}} className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
              {generatingQuiz === viewingQuizFor.id ? (
                <div className="flex flex-col items-center justify-center h-full py-20">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-200 rounded-full animate-pulse"></div>
                    <div className="w-20 h-20 border-t-4 border-indigo-600 rounded-full animate-spin absolute top-0 left-0"></div>
                    <Zap className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-bounce" />
                  </div>
                  <h4 className="mt-6 font-bold text-slate-800 text-lg animate-pulse">Generating 50 Questions...</h4>
                  <p className="text-sm text-slate-500 mt-2 text-center max-w-sm">
                    Our AI professor is reading the material and crafting a comprehensive pop quiz. This usually takes about 30-60 seconds.
                  </p>
                </div>
              ) : quizQuestions.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-slate-500 text-sm">No questions generated yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-slate-700">{quizQuestions.length} Questions</span>
                  </div>
                  {quizQuestions.map((q, i) => (
                    <div key={q.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative group">
                      <div className="absolute top-3 right-3 z-10 flex gap-2">
                        <button 
                          onClick={() => handleDeleteQuizQuestion(q.id)} 
                          className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-bold transition-colors border border-red-100"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="font-bold text-sm text-slate-800 mb-3 pr-16"><span className="text-indigo-500 mr-2">{i + 1}.</span>{q.question_text}</p>
                      <div className="space-y-2 ml-6">
                        <div className={`p-2 rounded border text-sm ${q.correct_option === 'A' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <span className="font-bold mr-2">A.</span> {q.option_a} {q.correct_option === 'A' && '✓'}
                        </div>
                        <div className={`p-2 rounded border text-sm ${q.correct_option === 'B' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <span className="font-bold mr-2">B.</span> {q.option_b} {q.correct_option === 'B' && '✓'}
                        </div>
                        <div className={`p-2 rounded border text-sm ${q.correct_option === 'C' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                          <span className="font-bold mr-2">C.</span> {q.option_c} {q.correct_option === 'C' && '✓'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
